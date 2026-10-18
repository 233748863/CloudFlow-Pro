import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

// A real-browser component check; no business requests or authentication fixtures.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium, devices } = requireBrowser('playwright-core');
const [round, build = 'r15', mode = 'probe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build, /^r[1-9][0-9]*$/); assert.ok(['probe', 'verify'].includes(mode));
const evidenceRoot = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidenceRoot, 'c1-form-accessibility-20261005-' + round);
await fs.mkdir(output);
const buildInputs = JSON.parse((await fs.readFile(path.join(evidenceRoot, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
const hash = async filename => createHash('sha256').update(await fs.readFile(filename)).digest('hex').toUpperCase();
const inputs = [...buildInputs, ...await Promise.all(['scripts/verify-c1-form-accessibility.mjs', 'scripts/form-checks/FormAccessibilityCheck.tsx'].map(async filename => ({ Path: filename, Hash: await hash(path.join(root,filename)) })))];
const checkInputs = async () => { for (const item of inputs) assert.equal(await hash(path.resolve(root,item.Path)),item.Hash.toUpperCase(),'Component or verified frontend input changed'); };
await checkInputs(); await fs.writeFile(path.join(output,'inputs.json'),JSON.stringify(inputs,null,2) + '\n');
const server = await createServer({root:frontend,configFile:path.join(frontend,'vite.config.ts'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[root]}}});
const results = [], pageErrors = [], requests = [];
const types = ['text','textarea','number','amount','date','datetime','time','rich_text','switch','select','multi_select','radio_group','checkbox_group','date_range','employee','dept','post','position','user_multi','dept_multi','dict_select','upload_file','upload_image'];
const references = ['employee','dept','post','position','user_multi','dept_multi','dict_select'];
const paths = [...types,'lines[0].name','lines[1].name',...references.map(type => 'draft_' + type)];
const observe = page => page.evaluate(paths => paths.map(path => {
  const field = document.getElementById('field-' + path), label = document.getElementById('label-' + path);
  const error = document.getElementById('error-' + path);
  const primary = document.getElementById('input-' + path);
  const controls = ['radio_group','checkbox_group'].includes(path) ? [...field.querySelectorAll('input')] : primary ? [primary] : [];
  return {path,rendered:Boolean(field),errorVisible:Boolean(error && error.getBoundingClientRect().height),errorId:error?.id || '',labelLinked:Boolean(primary && label && (primary.getAttribute('aria-labelledby')?.split(/\s+/).includes(label.id) || label.control === primary)),controls:controls.map(control => ({
    tag:control.tagName,role:control.getAttribute('role'),id:control.id,invalid:control.getAttribute('aria-invalid'),describedBy:control.getAttribute('aria-describedby'),
    errorLinked:Boolean(error && control.getAttribute('aria-describedby')?.split(/\s+/).includes(error.id)),
  }))};
}), paths);
const verifyErrors = observations => {
  assert.equal(observations.length,32);
  assert.ok(observations.every(item => item.rendered && item.errorVisible && item.controls.length),'Every expected field must render an error and a control');
  if(mode === 'verify') assert.ok(observations.every(item => item.labelLinked && item.controls.every(control => control.errorLinked && control.invalid === 'true')),'Every control must name its field and describe its own error');
};
let browser, failure, activePage;
try {
  await server.listen(); const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const origin = 'http://127.0.0.1:' + address.port;
  browser = await chromium.launch({headless:true});
  for (const device of ['desktop','mobile']) {
    const context = await browser.newContext(device === 'mobile' ? {...devices['Pixel 5'],viewport:{width:390,height:844},serviceWorkers:'block'} : {viewport:{width:1440,height:1040},serviceWorkers:'block'});
    await context.routeWebSocket('**/*',socket => socket.close());
    await context.route('**/*',async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !['GET','HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { requests.push({method:request.method(),path:url.pathname}); return route.abort(); }
      if (url.pathname === '/c1-accessibility') {
        const entry = '/@fs/' + path.join(root,'scripts/form-checks/FormAccessibilityCheck.tsx').replaceAll('\\','/');
        return route.fulfill({contentType:'text/html',body:`<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`});
      }
      return route.continue();
    });
    const page = await context.newPage(); activePage = page; page.on('pageerror',error => pageErrors.push({device,message:error.message}));
    await page.goto(origin + '/c1-accessibility'); await page.getByRole('heading',{name:'字段错误关联验证',exact:true}).waitFor();
    const show = page.getByRole('button',{name:'显示字段错误',exact:true}); if (device === 'mobile') await show.tap(); else await show.click();
    await page.getByText('请核对字段 TEXT',{exact:true}).waitFor();
    const observations = await observe(page);
    const unlinked = observations.filter(item => item.controls.some(control => !control.errorLinked));
    const result = {device,fields:observations.length,unlinkedFields:unlinked.length,observations,checks:[]}; results.push(result);
    await page.screenshot({path:path.join(output,device + '-errors.png'),fullPage:true});
    verifyErrors(observations);
    await fs.writeFile(path.join(output,device + '-accessibility.txt'),await page.locator('main').ariaSnapshot());
    const id = name => page.locator(`[id="${name}"]`);
    const activate = async locator => device === 'mobile' ? locator.tap() : locator.click();
    const values = async () => JSON.parse(await page.getByTestId('form-values').textContent());
    for (const type of types.filter(type => !['radio_group','checkbox_group'].includes(type))) {
      assert.equal(await page.getByLabel((type.startsWith('upload_') ? '选择' : '') + '字段 ' + type.toUpperCase(),{exact:false}).and(id('input-' + type)).count(),1,'Accessible field label: ' + type);
    }
    assert.equal(await page.getByRole('radiogroup',{name:/字段 RADIO_GROUP/}).count(),1);
    assert.equal(await page.getByRole('radio',{name:'甲',exact:true}).count(),1);
    assert.equal(await page.getByRole('checkbox',{name:'甲',exact:true}).count(),1);
    for(const type of ['upload_file','upload_image']) {
      const fileInput = page.getByLabel('选择字段 ' + type.toUpperCase(),{exact:true});
      assert.equal(await fileInput.count(),1,'File picker keeps its action label');
      assert.equal(await fileInput.getAttribute('aria-describedby'),'error-' + type);
      assert.equal(await fileInput.getAttribute('aria-invalid'),'true');
      const uploadButton = id('field-' + type).getByRole('button',{name:'上传附件',exact:true});
      assert.equal(await uploadButton.getAttribute('aria-describedby'),'error-' + type);
      assert.equal(await uploadButton.getAttribute('aria-invalid'),'true');
    }
    result.checks.push('accessible labels and option names');
    const duplicateIds = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return ids.filter((value,index) => ids.indexOf(value) !== index); });
    assert.deepEqual(duplicateIds,[],'Field, row, attachment and draft ids must be unique');
    result.checks.push('unique ids across two rows and draft references');
    await page.getByRole('button',{name:'清除字段错误',exact:true}).click();
    assert.equal(await page.getByText('请核对字段 TEXT',{exact:true}).count(),0);
    const cleared = await observe(page);
    assert.ok(cleared.every(item => !item.errorVisible && item.controls.every(control => !control.invalid && !control.describedBy)),'Clearing errors must remove stale descriptions and invalid state');
    result.checks.push('cleared errors remove associations');
    await activate(page.getByRole('button',{name:'执行填写校验',exact:true}));
    assert.equal(await page.getByTestId('validation-result').textContent(),'校验未通过');
    for(const path of ['text','lines[0].name','lines[1].name']) {
      assert.equal(await id('error-' + path).textContent(),'此项必填');
      assert.equal(await id('input-' + path).getAttribute('aria-describedby'),'error-' + path);
    }
    await id('input-text').fill('已填写');
    await id('input-lines[0].name').fill('第一行已填写');
    await activate(page.getByRole('button',{name:'执行填写校验',exact:true}));
    assert.equal(await id('error-text').count(),0); assert.equal(await id('error-lines[0].name').count(),0);
    assert.equal(await id('error-lines[1].name').textContent(),'此项必填');
    assert.equal(await id('input-lines[0].name').getAttribute('aria-describedby'),null);
    assert.equal(await id('input-lines[1].name').getAttribute('aria-describedby'),'error-lines[1].name');
    result.checks.push('real required validation and row-specific revalidation');
    await id('input-text').focus(); await page.keyboard.press('Tab');
    assert.equal(await id('input-textarea').evaluate(node => node === document.activeElement),true);
    await id('input-select').focus(); await page.keyboard.press('Enter');
    await page.getByRole('option',{name:'甲',exact:true}).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal((await values()).select,'乙');
    result.checks.push('keyboard tab, selector opening, option navigation and selection');
    await id('input-switch').focus(); await page.keyboard.press('Space');
    assert.equal((await values()).switch,true);
    assert.equal(await id('input-switch').getAttribute('aria-checked'),'true');
    result.checks.push('switch keyboard activation preserves checked state');
    for(const [type,label] of [['multi_select','甲'],['employee','样本员工'],['dept','样本部门'],['post','样本岗位'],['position','样本职位'],['user_multi','样本用户'],['dept_multi','样本部门'],['dict_select','样本字典']]) {
      const option = page.getByRole('option').filter({hasText:label});
      await activate(id('input-' + type)); await activate(option);
      if(['multi_select','user_multi','dept_multi'].includes(type)) {
        if(device === 'mobile') await activate(page.getByRole('button',{name:'完成选择',exact:true}));
        else await option.press('Escape');
      }
      const value = (await values())[type]; assert.ok(Array.isArray(value) ? value.length === 1 : Boolean(value),'Real selector changed value: ' + type);
    }
    result.checks.push('eight shared selectors preserve selected values');
    await activate(id('input-date')); await activate(page.getByRole('button',{name:'今天',exact:true}));
    assert.match((await values()).date,/^\d{4}-\d{2}-\d{2}$/);
    await activate(id('input-date_range'));
    await page.getByLabel('开始日期',{exact:true}).fill('2026-10-01');
    if(device === 'mobile') await activate(page.getByRole('button',{name:'下一步',exact:true}));
    await page.getByLabel('结束日期',{exact:true}).fill('2026-10-05');
    await activate(page.getByRole('button',{name:'应用',exact:true}));
    assert.deepEqual((await values()).date_range,['2026-10-01','2026-10-05']);
    result.checks.push('date and date-range desktop/mobile value changes');
    await id('input-rich_text').fill('**填写内容**');
    const rich = id('field-rich_text'); await activate(rich.getByRole('button',{name:'预览',exact:true}));
    assert.equal(await rich.locator('strong').textContent(),'填写内容');
    await activate(rich.getByRole('button',{name:'编辑',exact:true}));
    assert.equal(await id('input-rich_text').inputValue(),'**填写内容**');
    result.checks.push('rich text preview and editing preserve value');
    await activate(page.getByRole('button',{name:'显示字段错误',exact:true}));
    verifyErrors(await observe(page));
    result.checks.push('errors reattach after value changes');
    await context.close();
  }
  assert.equal(pageErrors.length,0,'Component browser error'); assert.equal(requests.length,0,'Component must not require business requests');
  if(mode === 'verify') assert.ok(results.every(result => result.unlinkedFields === 0),'Form error association missing');
} catch(error) {
  failure=error;
  if(activePage && !activePage.isClosed()) {
    await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(() => undefined);
    await fs.writeFile(path.join(output,'failure-accessibility.txt'),await activePage.locator('main').ariaSnapshot()).catch(() => undefined);
  }
}
finally {
  if(browser) await browser.close(); await server.close();
  try { await checkInputs(); } catch(error) { failure=new AggregateError([failure,error].filter(Boolean),'Component inputs changed'); }
  const summary={mode,componentOnly:true,frontendBuild:build,results,pageErrors,blockedRequests:requests,inputs:inputs.length,passed:!failure,wholeC1Acceptance:false};
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(summary,null,2) + '\n');
  console.log('C1_FORM_ACCESSIBILITY: ' + JSON.stringify({mode,componentOnly:true,devices:results.map(item => ({device:item.device,fields:item.fields,unlinkedFields:item.unlinkedFields})),pageErrors:pageErrors.length,businessRequests:requests.length,inputs:inputs.length,passed:!failure,wholeC1Acceptance:false}));
}
if(failure) throw failure;
