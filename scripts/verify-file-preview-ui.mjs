import assert from 'node:assert/strict';
import path from 'node:path';
import { previewPause, previewSql } from './file-preview-fixtures.mjs';

export async function verifyFilePreviewUi(context) {
  const { actor, files, records, upload, check, database, directory, caseTag, evidence, sensitive } = context;
  const origin = new URL(actor.url()).origin;
  const errors = [];
  const external = [];
  const shellExternal = [];
  const shellAvatarRequests = [];
  const previewing = new Set();
  console.log(`H5_PREVIEW_UI_BROWSER: version=${actor.context().browser().version()}; interface_doubles=0`);
  const prefix = `H5P_${caseTag}`;
  const unsupported = await upload(actor, 'unsupported.txt', Buffer.from('Original authorized download fallback'), 'text/plain');
  const damaged = await upload(actor, 'damaged.pdf', Buffer.from('%PDF-1.7\nDamaged document without catalog\n%%EOF\n'));
  const additionalImages = [];
  for (const format of ['jpeg', 'gif', 'webp']) {
    additionalImages.push(await upload(actor, `ui-format.${format}`, Buffer.from(context.images[format], 'base64'), `image/${format}`));
  }
  const waitFor = async (predicate, label) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) { if (await predicate()) return; await previewPause(100); }
    throw new Error(label);
  };
  const observe = () => {
    const stats = { created: new Set(), revoked: new Set(), workers: 0, terminated: 0 };
    window.__filePreviewResources = stats;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = source => { const url = create(source); stats.created.add(url); return url; };
    URL.revokeObjectURL = url => { stats.revoked.add(url); revoke(url); };
    const WorkerClass = window.Worker;
    window.Worker = class extends WorkerClass {
      constructor(...parameters) { super(...parameters); stats.workers++; }
      terminate() { if (!this.__previewTerminated) stats.terminated++; this.__previewTerminated = true; super.terminate(); }
    };
  };
  const mobileContext = await actor.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    serviceWorkers: 'block', storageState: await actor.context().storageState(),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const mobile = await mobileContext.newPage();
  for (const page of [actor, mobile]) {
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', async response => {
      if (new URL(response.url()).pathname !== '/api/auth/system/file/preview-ticket' || response.status() !== 200) return;
      const result = await response.json().catch(() => undefined);
      if (result?.data?.streamUrl) {
        const params = new URL(result.data.streamUrl, origin).searchParams;
        sensitive.add(params.get('previewToken')); sensitive.add(params.get('signature'));
      }
    });
    page.on('dialog', async dialog => { errors.push('PDF attempted to open a browser dialog'); await dialog.dismiss(); });
    await page.addInitScript(observe);
    await page.context().route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      const source = await page.evaluate(address => {
        const avatar = document.querySelector('.app-user-menu-button .app-avatar img');
        return { previewMounted: Boolean(document.querySelector('.file-preview-dialog')), shellAvatar: avatar?.src === address };
      }, url.href).catch(() => ({ previewMounted: true, shellAvatar: false }));
      if (source.shellAvatar && route.request().resourceType() === 'image') {
        shellAvatarRequests.push(url.origin + url.pathname);
        shellExternal.push(url.origin + url.pathname);
      } else (previewing.has(page) && source.previewMounted ? external : shellExternal).push(url.origin + url.pathname);
      return route.abort();
    });
  }
  const navigate = (page, destination) => page.evaluate(async route => { const module = await import('/src/router.tsx'); await module.router.navigate(route); }, destination);
  const previewDialog = page => page.locator('.file-preview-dialog');
  const close = async (page, opener) => {
    await previewDialog(page).getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await previewDialog(page).waitFor({ state: 'hidden' });
    previewing.delete(page);
    if (opener) check('关闭预览后键盘焦点返回原附件按钮', await opener.evaluate(element => document.activeElement === element));
  };
  const open = async (page, button, file, expectedType) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/system/file/preview-ticket'
      && response.request().method() === 'POST');
    previewing.add(page);
    await button.click();
    const response = await pending;
    const actual = await response.json();
    const requested = response.request().postDataJSON();
    check(`页面${expectedType}通过真实业务上下文申请凭据`, response.status() === 200 && actual.code === 200 && requested.bizType === expectedType);
    if (actual.data?.streamUrl) {
      const params = new URL(actual.data.streamUrl, origin).searchParams;
      sensitive.add(params.get('previewToken')); sensitive.add(params.get('signature'));
    }
    const dialog = previewDialog(page);
    await dialog.waitFor();
    if (!actual.data.supported) { await dialog.getByRole('alert').waitFor(); return dialog; }
    if (file.mediaType === 'application/pdf') {
      await waitFor(async () => await dialog.locator('.file-preview-pdf-page canvas').count() === 1
        && await dialog.locator('.file-preview-pdf-page .textLayer span').count() > 0
        && await dialog.getByText(/^正在渲染第/).count() === 0, `PDF页面未完成渲染 ${expectedType}`);
    } else {
      await waitFor(() => dialog.locator('.file-preview-image-stage img').evaluateAll(elements => elements.length === 1
        && elements[0].complete && elements[0].naturalWidth > 0), `图片页面未完成解码 ${expectedType}`);
    }
    check(`页面${expectedType}显示真实文件名`, await dialog.getByRole('heading', { name: file.name, exact: true }).count() === 1);
    return dialog;
  };
  const fileButton = async (page, file) => {
    await navigate(page, '/system/files');
    const query = page.getByPlaceholder('按文件名搜索', { exact: true });
    await query.fill(file.name); await query.press('Enter');
    const button = page.getByRole('button', { name: `预览 ${file.name}`, exact: true });
    await button.waitFor(); return button;
  };
  const verifyFileQueryOrder = async (page, mode) => {
    const query = page.getByPlaceholder('按文件名搜索', { exact: true });
    await query.waitFor();
    await page.getByRole('button', { name: /^预览 h5p_/ }).first().waitFor();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let captured = false;
    let delivered = false;
    const older = async route => {
      const address = new URL(route.request().url());
      if (address.searchParams.get('fileName') !== files.license.name) return route.continue();
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'Older file query must reach the real service');
      const content = await response.json();
      assert.ok(JSON.stringify(content).includes(files.license.name), 'Older query must contain its actual file');
      captured = true;
      await gate;
      try { await route.fulfill({ response }); delivered = true; }
      catch (error) { if (!/closed|aborted|cancelled|canceled|handled/i.test(error.message)) throw error; }
    };
    await page.route('**/api/auth/system/file/list?**', older);
    try {
      await query.fill(files.license.name); await query.press('Enter');
      await waitFor(async () => captured, '未捕获较早的真实文件查询响应');
      await query.fill(files.public.name); await query.press('Enter');
      const latestButton = page.getByRole('button', { name: `预览 ${files.public.name}`, exact: true });
      await latestButton.waitFor();
      check(`${mode}较早查询延迟期间新查询显示正确附件`, await query.inputValue() === files.public.name);
      release();
      await waitFor(async () => delivered, '较早真实文件查询响应未释放');
      await previewPause(400);
      check(`${mode}较早真实查询迟到后不能覆盖新附件结果`, await latestButton.isVisible()
        && !await page.getByRole('button', { name: `预览 ${files.license.name}`, exact: true }).isVisible());
      console.log(`H5_PREVIEW_FILE_QUERY_ORDER: device=${mode}; responses=real; reordered=true; latest_result_preserved=true; interface_doubles=0`);
    } finally {
      release();
      await page.unroute('**/api/auth/system/file/list?**', older);
    }
  };
  const referenceButton = async (page, scope, file) => {
    const reference = await page.evaluate(async value => (await import('/src/utils/attachment.ts')).normalizeAttachmentUrl(value), file.reference);
    return scope.locator(`a[href=${JSON.stringify(reference)}]`).locator('..').getByRole('button', { name: /^预览 / });
  };
  const verifyReference = async (page, scope, file, type) => {
    const button = await referenceButton(page, scope, file);
    await button.waitFor(); await open(page, button, file, type); await close(page, button);
  };
  const readableBounds = async (page, label) => {
    const measured = await previewDialog(page).evaluate(element => ({ panelWidth: element.getBoundingClientRect().width, viewportWidth: innerWidth,
      panelTop: element.getBoundingClientRect().top, panelBottom: element.getBoundingClientRect().bottom, viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth, offenders: [...element.querySelectorAll('button, input, a')]
        .filter(control => control.getClientRects().length).flatMap(control => {
          const bounds = control.getBoundingClientRect();
          return bounds.width < 43.9 || bounds.height < 43.9 ? [{ label: control.getAttribute('aria-label') || control.textContent, width: bounds.width, height: bounds.height }] : [];
        }) }));
    check(`${label}弹层完整处于视口且全部触控目标至少44px ${JSON.stringify(measured)}`, measured.panelWidth <= measured.viewportWidth + 1
      && measured.panelTop >= -1 && measured.panelBottom <= measured.viewportHeight + 1
      && measured.documentWidth <= measured.viewportWidth + 1 && measured.offenders.length === 0);
  };
  const textAlignment = page => previewDialog(page).evaluate(element => {
    const canvas = element.querySelector('.file-preview-pdf-page canvas');
    const layer = element.querySelector('.file-preview-pdf-page .textLayer');
    const canvasBounds = canvas.getBoundingClientRect();
    const layerBounds = layer.getBoundingClientRect();
    const context2d = canvas.getContext('2d');
    const matches = [...layer.querySelectorAll('.file-preview-text-match')].map(highlight => {
      const bounds = highlight.getBoundingClientRect();
      const left = Math.max(0, Math.floor((bounds.left - canvasBounds.left) * canvas.width / canvasBounds.width));
      const top = Math.max(0, Math.floor((bounds.top - canvasBounds.top) * canvas.height / canvasBounds.height));
      const right = Math.min(canvas.width, Math.ceil((bounds.right - canvasBounds.left) * canvas.width / canvasBounds.width));
      const bottom = Math.min(canvas.height, Math.ceil((bounds.bottom - canvasBounds.top) * canvas.height / canvasBounds.height));
      let inkPixels = 0;
      if (right > left && bottom > top) {
        const pixels = context2d.getImageData(left, top, right - left, bottom - top).data;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] > 0 && pixels[offset] < 128 && pixels[offset + 1] < 128 && pixels[offset + 2] < 128) inkPixels++;
        }
      }
      return { index: highlight.dataset.matchIndex, text: highlight.textContent, inkPixels };
    });
    return { rotation: Number(layer.dataset.mainRotation), canvasWidth: canvasBounds.width, canvasHeight: canvasBounds.height,
      layerWidth: layerBounds.width, layerHeight: layerBounds.height,
      dimensionsMatch: Math.abs(canvasBounds.width - layerBounds.width) <= 1 && Math.abs(canvasBounds.height - layerBounds.height) <= 1, matches };
  });
  const aligned = measured => measured.dimensionsMatch && measured.matches.length > 0
    && measured.matches.every(match => match.text === 'Preview' && match.inkPixels > 0);
  const verifyTextAlignment = async (page, label) => {
    const measured = await textAlignment(page);
    check(`${label}高亮覆盖真实PDF字形且文字层与画布对齐 ${JSON.stringify(measured)}`, aligned(measured));
  };
  const settledRotation = async (dialog, rotation) => waitFor(async () => await dialog.locator(`.textLayer[data-main-rotation="${rotation}"] .file-preview-text-match`).count() > 0
    && await dialog.getByText(/^正在渲染第/).count() === 0, `PDF ${rotation}度旋转尚未完成文字和画布渲染`);
  const verifyDimensionFault = async (page, mode) => {
    const host = previewDialog(page).locator('.file-preview-pdf-page');
    const properties = ['--scale-round-x', '--scale-round-y'];
    const saved = await host.evaluate((element, names) => names.map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]), properties);
    try {
      await host.evaluate((element, names) => names.forEach(name => element.style.setProperty(name, 'initial')), properties);
      const faulty = await textAlignment(page);
      check(`${mode}移除文字层尺寸参数的负例被真实位置检查拒绝 ${JSON.stringify(faulty)}`, !faulty.dimensionsMatch && !aligned(faulty));
    } finally {
      await host.evaluate((element, values) => values.forEach(([name, value, priority]) => {
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      }), saved);
    }
    await verifyTextAlignment(page, `${mode}恢复文字层尺寸参数`);
  };
  let currentPage = actor;
  try {
    for (const [mode, page] of [['desktop', actor], ['mobile', mobile]]) {
      currentPage = page;
      if (mode === 'mobile') { console.log('WAIT 两设备使用同一真实账号，保留限流并等待61秒'); await previewPause(61000); }
      await page.goto(`${origin}/system/files`, { waitUntil: 'domcontentloaded' });
      await verifyFileQueryOrder(page, mode);
      const button = await fileButton(page, files.public);
      const dialog = await open(page, button, files.public, 'PUBLIC');
      await readableBounds(page, `${mode}PDF`);
      check(`${mode}PDF真实独立worker已启动且没有可执行注释层`, await page.evaluate(() => window.__filePreviewResources.workers > window.__filePreviewResources.terminated)
        && await dialog.locator('.annotationLayer, iframe, object, embed').count() === 0);
      await dialog.getByRole('textbox', { name: '搜索文档', exact: true }).fill('Preview');
      await waitFor(async () => (await dialog.locator('[role="status"]').allTextContents()).some(text => text.includes('1 / 3')), 'PDF搜索结果未出现');
      check(`${mode}文字层只精确高亮当前匹配`, await dialog.locator('.file-preview-text-match.selected').getAttribute('data-match-index') === '0');
      await verifyTextAlignment(page, `${mode}原始方向`);
      await dialog.getByRole('button', { name: '下一处匹配', exact: true }).click();
      await waitFor(async () => await dialog.locator('.file-preview-text-match.selected').getAttribute('data-match-index') === '1', '同页第二个匹配未定位');
      check(`${mode}下一处匹配可定位同一页第二处`, await dialog.getByRole('spinbutton', { name: 'PDF页码' }).inputValue() === '1');
      await dialog.getByRole('button', { name: '下一处匹配', exact: true }).click();
      await waitFor(async () => await dialog.getByRole('spinbutton', { name: 'PDF页码' }).inputValue() === '2'
        && await dialog.locator('.file-preview-text-match.selected').getAttribute('data-match-index') === '2', '跨页搜索未定位');
      check(`${mode}搜索可跳到真实第二页`, true);
      await dialog.getByRole('button', { name: '放大PDF', exact: true }).click();
      await dialog.getByRole('button', { name: '顺时针旋转PDF90度', exact: true }).click();
      await waitFor(() => dialog.locator('.file-preview-pdf-page canvas').evaluateAll(elements => elements.length === 1 && elements[0].width > elements[0].height), 'PDF旋转未生效');
      check(`${mode}PDF缩放和90度旋转生效`, await dialog.getByText('125%', { exact: true }).count() === 1);
      await settledRotation(dialog, 90);
      await verifyTextAlignment(page, `${mode}放大后90度`);
      await verifyDimensionFault(page, mode);
      for (const rotation of [180, 270, 0, 90]) {
        await dialog.getByRole('button', { name: '顺时针旋转PDF90度', exact: true }).click();
        await settledRotation(dialog, rotation);
        await verifyTextAlignment(page, `${mode}放大后${rotation}度`);
      }
      await dialog.getByRole('spinbutton', { name: 'PDF页码' }).fill('1');
      await dialog.getByRole('spinbutton', { name: 'PDF页码' }).press('Enter');
      await waitFor(async () => await dialog.locator('canvas').evaluateAll(elements => elements.length === 1 && elements[0].getAttribute('aria-label')?.endsWith('第1页'))
        && await dialog.getByText(/^正在渲染第/).count() === 0, 'PDF页码跳转未完成渲染');
      await settledRotation(dialog, 90);
      await verifyTextAlignment(page, `${mode}手动返回第一页`);
      await readableBounds(page, `${mode}旋转后PDF`);
      console.log(`H5_PREVIEW_TEXT_ALIGNMENT: device=${mode}; rotations=0,90,180,270; real_canvas_pixels=true; missing_dimensions_rejected=true; interface_doubles=0`);
      await page.screenshot({ path: path.join(directory, `h5-preview-pdf-${mode}-${caseTag}.png`), fullPage: false });
      await close(page, button);
      await waitFor(() => page.evaluate(() => window.__filePreviewResources.workers === window.__filePreviewResources.terminated), '关闭PDF后worker未释放');
      check(`${mode}关闭PDF后独立worker已销毁`, true);
      const imageButton = await fileButton(page, files.license);
      const imageDialog = await open(page, imageButton, files.license, 'PUBLIC');
      for (let step = 0; step < 6; step++) await imageDialog.getByRole('button', { name: '放大图片', exact: true }).click();
      await imageDialog.getByRole('button', { name: '顺时针旋转图片90度', exact: true }).click();
      const layout = await imageDialog.locator('.file-preview-image-canvas').evaluate(container => {
        const canvas = container.getBoundingClientRect();
        const image = container.querySelector('img').getBoundingClientRect();
        return { left: image.left - canvas.left, top: image.top - canvas.top, right: image.right - canvas.left, bottom: image.bottom - canvas.top,
          width: canvas.width, height: canvas.height };
      });
      check(`${mode}放大旋转后完整图片处于可滚动正坐标内 ${JSON.stringify(layout)}`, layout.left >= -1 && layout.top >= -1
        && layout.right <= layout.width + 1 && layout.bottom <= layout.height + 1);
      await imageDialog.locator('.file-preview-image-stage').focus();
      await page.keyboard.press('r'); await page.keyboard.press('-');
      check(`${mode}图片键盘旋转和缩放生效`, await imageDialog.getByText('225%', { exact: true }).count() === 1);
      await readableBounds(page, `${mode}图片`);
      await page.screenshot({ path: path.join(directory, `h5-preview-image-${mode}-${caseTag}.png`), fullPage: false });
      await close(page, imageButton);
      check(`${mode}关闭图片后所有Blob地址撤销`, await page.evaluate(() => [...window.__filePreviewResources.created].every(url => window.__filePreviewResources.revoked.has(url))));
      for (const file of additionalImages) {
        const opener = await fileButton(page, file);
        const image = await open(page, opener, file, 'PUBLIC');
        await image.getByRole('button', { name: '放大图片', exact: true }).click();
        await image.getByRole('button', { name: '顺时针旋转图片90度', exact: true }).click();
        check(`${mode}${file.mediaType}真实解码、缩放和旋转可用`, await image.getByText('125%', { exact: true }).count() === 1
          && await image.locator('.file-preview-image-stage img').evaluate(element => element.complete && element.naturalWidth > 0
            && getComputedStyle(element).transform !== 'none'));
        await close(page, opener);
        check(`${mode}${file.mediaType}关闭后Blob已回收`, await page.evaluate(() => [...window.__filePreviewResources.created].every(url => window.__filePreviewResources.revoked.has(url))));
      }
      const unsupportedButton = await fileButton(page, unsupported);
      const fallback = await open(page, unsupportedButton, unsupported, 'PUBLIC');
      check(`${mode}不支持格式明确提示并保留原授权下载`, /下载/.test(await fallback.getByRole('alert').innerText())
        && await fallback.getByRole('link', { name: '授权下载原附件' }).getAttribute('href') === unsupported.reference);
      await close(page, unsupportedButton);
      const damagedButton = await fileButton(page, damaged);
      const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === '/api/auth/system/file/preview-ticket');
      previewing.add(page);
      await damagedButton.click();
      const damagedResult = await (await response).json();
      if (damagedResult.data?.streamUrl) {
        const params = new URL(damagedResult.data.streamUrl, origin).searchParams;
        sensitive.add(params.get('previewToken')); sensitive.add(params.get('signature'));
      }
      await previewDialog(page).getByRole('alert').waitFor();
      check(`${mode}损坏PDF显示明确下载回退且无未处理异常`, /PDF损坏|页面无法安全渲染/.test(await previewDialog(page).getByRole('alert').innerText()));
      await close(page, damagedButton);

      await navigate(page, `/office/contracts?searchId=${records.contractId}`);
      const contract = page.getByRole('dialog', { name: prefix, exact: true });
      await contract.waitFor();
      await verifyReference(page, contract, files.contract, 'OA_CONTRACT');
      await verifyReference(page, contract, files.archive, 'OA_CONTRACT');
      const evidenceButton = contract.getByRole('button', { name: '预览 履约证据', exact: true });
      await open(page, evidenceButton, files.evidence, 'OA_CONTRACT_EVIDENCE'); await close(page, evidenceButton);
      await contract.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      database(`UPDATE oa_contract SET signed_flag=1 WHERE contract_id=${records.contractId} AND create_by=${previewSql(context.person.username)};`);
      try {
        await navigate(page, '/office/contracts'); await navigate(page, `/office/contracts?searchId=${records.contractId}`);
        const signedButton = contract.getByRole('button', { name: '预览 合同签署文件', exact: true });
        await open(page, signedButton, files.signed, 'OA_CONTRACT_SIGNED'); await close(page, signedButton);
        await contract.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      } finally { database(`UPDATE oa_contract SET signed_flag=0 WHERE contract_id=${records.contractId} AND create_by=${previewSql(context.person.username)};`); }
      await navigate(page, '/admin/license');
      await page.getByPlaceholder('按证照名称搜索', { exact: true }).fill(prefix);
      await page.getByRole('row').filter({ hasText: prefix }).getByRole('button', { name: '查看详情', exact: true }).click();
      const license = page.getByRole('dialog', { name: prefix, exact: true });
      await verifyReference(page, license, files.license, 'OA_LICENSE');
      await license.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await navigate(page, '/office/knowledge');
      await page.getByRole('button', { name: '我的提交', exact: true }).click();
      const knowledgeRow = page.getByRole('row').filter({ hasText: prefix });
      await knowledgeRow.getByRole('button', { name: '查看详情', exact: true }).click();
      const knowledge = page.getByRole('dialog', { name: prefix, exact: true });
      await verifyReference(page, knowledge, files.knowledge, 'OA_KNOWLEDGE');
      await knowledge.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await knowledgeRow.getByRole('button', { name: '版本历史', exact: true }).click();
      const history = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /版本历史/ }) });
      await verifyReference(page, history, files.history, 'OA_KNOWLEDGE');
      await history.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await navigate(page, '/expense/claim');
      await page.getByRole('row').filter({ hasText: prefix }).getByRole('button', { name: '详情', exact: true }).click();
      const expense = page.getByRole('dialog');
      await verifyReference(page, expense, files.expense, 'OA_EXPENSE');
      await expense.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await navigate(page, '/office/invoice');
      await page.getByPlaceholder('搜索发票代码或号码', { exact: true }).fill(prefix);
      await page.getByRole('row').filter({ hasText: prefix }).getByRole('button', { name: '详情', exact: true }).click();
      const invoice = page.getByRole('dialog');
      await verifyReference(page, invoice, files.invoice, 'OA_INVOICE');
      await invoice.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await navigate(page, '/hr/recruitment');
      await page.getByRole('tab', { name: '候选人', exact: true }).click();
      await page.getByPlaceholder('搜索需求编号、岗位、候选人、邮箱或状态', { exact: true }).fill(prefix);
      await verifyReference(page, page.getByRole('row').filter({ hasText: prefix }), files.resume, 'HR_RESUME');
      await navigate(page, '/admin/supplier');
      await page.getByPlaceholder('搜索供应商名称', { exact: true }).fill(prefix);
      await page.getByRole('row').filter({ hasText: prefix }).getByRole('button', { name: '查看详情', exact: true }).click();
      const supplier = page.getByRole('dialog', { name: '供应商详情', exact: true });
      await verifyReference(page, supplier, files.qualification, 'OA_SUPPLIER_QUALIFICATION');
      await supplier.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      if (context.workflow) {
        await navigate(page, `/workflow/search-instance/${context.workflow.instanceId}`);
        const workflowButton = page.getByRole('button', { name: `预览 ${context.workflow.file.name}`, exact: true });
        await workflowButton.waitFor(); await open(page, workflowButton, context.workflow.file, 'WORKFLOW_FORM'); await close(page, workflowButton);
      }
      evidence[mode] = true;
      console.log(`H5_PREVIEW_UI_DEVICE: device=${mode}; real_pdf=true; real_image=true; exact_match_navigation=true; original_business_entries=true; workflow_entry=${Boolean(context.workflow)}; interface_doubles=0`);
    }
    currentPage = actor;
    console.log('WAIT 生命周期专项沿用原账号，保留限流并等待61秒'); await previewPause(61000);
    const lateButton = await fileButton(actor, files.public);
    let captured;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const late = async route => {
      const response = await route.fetch();
      captured = response.status();
      await gate;
      try { await route.fulfill({ response }); } catch (error) { if (!/closed|aborted|cancelled|canceled|handled/i.test(error.message)) throw error; }
    };
    await actor.route('**/api/auth/system/file/preview-content?**', late);
    try {
      previewing.add(actor);
      await lateButton.click();
      await waitFor(async () => captured === 200, '未捕获真实预览字节响应');
      await close(actor, lateButton);
      release(); await previewPause(600);
      check('已提交真实请求的迟到响应不会重新打开已关闭预览', await previewDialog(actor).count() === 0);
    } finally { release(); await actor.unroute('**/api/auth/system/file/preview-content?**', late); }
    const logoutButton = await fileButton(actor, files.license);
    await open(actor, logoutButton, files.license, 'PUBLIC');
    await actor.evaluate(async () => {
      const auth = await import('/src/services/api/auth.ts');
      await auth.logout();
      window.dispatchEvent(new CustomEvent('cloudflow:auth-expired'));
    });
    await previewDialog(actor).waitFor({ state: 'hidden' });
    previewing.delete(actor);
    await waitFor(() => actor.evaluate(() => [...window.__filePreviewResources.created].every(url => window.__filePreviewResources.revoked.has(url))
      && window.__filePreviewResources.workers === window.__filePreviewResources.terminated), '退出登录后预览资源未销毁');
    check('真实退出接口和登录失效通知清除图片、PDF与旧预览', true);
    check(`双端页面无未处理异常 ${JSON.stringify(errors)}`, errors.length === 0);
    check(`PDF脚本未执行且预览未访问外部链接 ${JSON.stringify(external)}`, external.length === 0);
    console.log(`H5_PREVIEW_UI_NETWORK: preview_external_requests=${external.length}; shell_external_requests_blocked=${shellExternal.length}; shell_avatar_dom_sources=${shellAvatarRequests.length}; all_external_requests_blocked=true; shell_requests_not_preview_evidence=true`);
    evidence.cleanup = true;
  } catch (error) {
    await currentPage.screenshot({ path: path.join(directory, `h5-preview-ui-failure-${caseTag}.png`), fullPage: true }).catch(() => undefined);
    const diagnostic = JSON.stringify({ path: new URL(currentPage.url()).pathname,
      alerts: await currentPage.getByRole('alert').allTextContents(), errors, external, shellExternal, shellAvatarRequests,
      rejectedRequests: context.requests.filter(request => request.status >= 400).slice(-10).map(({ path, status }) => ({ path, status })) });
    console.log(`H5_PREVIEW_UI_FAILURE: ${[...sensitive].filter(value => typeof value === 'string' && value.length > 5)
      .reduce((result, value) => result.replaceAll(value, '[REDACTED]'), diagnostic)}`);
    throw error;
  } finally { await mobileContext.close(); }
}
