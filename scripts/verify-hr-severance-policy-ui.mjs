import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifySeverancePolicyInterface(context) {
  const { hr, peer, foreign, check, database, directory, caseTag, marker, evidence } = context;
  const output = path.join(directory, `h2-severance-policy-ui-${caseTag}`); await fs.mkdir(output, { recursive: true });
  const origin = new URL(hr.url()).origin; const errors = [];
  hr.on('pageerror', error => errors.push(error.message));
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const visit = async (actor, width) => { await actor.setViewportSize({ width, height: 1100 }); await actor.goto(`${origin}/hr/severance-rules`, { waitUntil: 'domcontentloaded' }); };
  const workspace = hr.locator('.severance-rules').first();
  const screenshot = async (scope, name, width) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')].filter(control => control.getClientRects().length).map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    check(`${name} ${width}px无横向溢出且触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`) });
  };
  const openEditor = async code => {
    await workspace.getByRole('button', { name: '新增政策', exact: true }).click();
    const dialog = hr.getByRole('dialog', { name: '新增离职补偿政策', exact: true });
    await dialog.getByLabel('政策编号', { exact: false }).fill(code);
    await dialog.getByLabel('政策名称', { exact: false }).fill(`政策_${code}`);
    await dialog.getByLabel('生效日期', { exact: false }).fill('2026-01-01');
    await dialog.getByLabel(marker, { exact: true }).check();
    await dialog.getByLabel('工资取样月数', { exact: false }).fill('12');
    await dialog.getByRole('button', { name: '工龄算法', exact: true }).click();
    await hr.getByRole('option', { name: '按完整日历月及不足月实际天数', exact: true }).click();
    await dialog.getByLabel('额外通知补偿月数', { exact: false }).fill('0');
    await dialog.getByRole('button', { name: '添加分档', exact: true }).click();
    await dialog.getByLabel('工龄下限（年）', { exact: false }).fill('0');
    await dialog.getByRole('button', { name: '分档计算方式', exact: true }).click();
    await hr.getByRole('option', { name: '每工龄年对应月数', exact: true }).click();
    await dialog.getByLabel(/^补偿月数\s*\*?$/).fill('1');
    return dialog;
  };
  await visit(hr, 1440); await workspace.getByRole('heading', { name: '离职补偿政策', exact: true }).waitFor();
  await workspace.getByLabel('搜索政策名称或编号').fill(marker); await workspace.getByRole('button', { name: '查看详情', exact: true }).first().waitFor();
  await screenshot(workspace, 'desktop-list', 1440);
  const code = `${marker}_ui`;
  let editor = await openEditor(code);
  await screenshot(editor, 'desktop-editor', 1440);
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  const detail = hr.getByRole('dialog', { name: '离职补偿政策详情', exact: true }); await detail.getByText(code, { exact: true }).waitFor();
  check('电脑真实保存草稿，缺政策文件禁止核定', await detail.getByRole('button', { name: '确认核定', exact: true }).isDisabled()
    && database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=100000 AND rule_code=${literal(code)} AND status='DRAFT' AND policy_file_id IS NULL;`) === '1'); evidence.desktop = true;
  await hr.setViewportSize({ width: 320, height: 1100 });
  await detail.getByRole('button', { name: '上传政策文件', exact: true }).click();
  const upload = hr.getByRole('dialog', { name: '上传核定政策文件', exact: true });
  const pdf = Buffer.from('%PDF-1.4\npolicy-ui-private-content\n%%EOF\n'); const fileName = `${code}.pdf`;
  await upload.getByLabel('核定政策文件', { exact: false }).setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdf });
  await screenshot(upload, 'mobile-policy-upload', 320);
  await upload.getByRole('button', { name: '保存政策文件', exact: true }).click(); await upload.waitFor({ state: 'hidden' }); await detail.getByText(fileName, { exact: true }).waitFor();
  await detail.getByRole('button', { name: '编辑草稿', exact: true }).click(); editor = hr.getByRole('dialog', { name: '编辑补偿政策草稿', exact: true });
  await editor.getByLabel('额外通知补偿月数', { exact: false }).fill('0.5'); await editor.getByLabel('核定说明', { exact: false }).fill(`${marker}_手机核定依据`);
  await screenshot(editor, 'mobile-editor', 320); await editor.getByRole('button', { name: '保存草稿', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  await detail.getByText(`${marker}_手机核定依据`, { exact: true }).waitFor();
  check('手机编辑实际保存政策数值和说明', database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=100000 AND rule_code=${literal(code)} AND notice_months=0.5 AND remark=${literal(`${marker}_手机核定依据`)};`) === '1');
  const downloadEvent = hr.waitForEvent('download'); await detail.getByRole('button', { name: '下载政策文件', exact: true }).click(); const download = await downloadEvent;
  check('手机下载政策文件名与字节完整', download.suggestedFilename() === fileName && createHash('sha256').update(await fs.readFile(await download.path())).digest('hex') === createHash('sha256').update(pdf).digest('hex'));
  await detail.getByRole('button', { name: '确认核定', exact: true }).click();
  const confirm = hr.getByRole('dialog', { name: '确认离职补偿政策', exact: true });
  check('核定需要明确再次确认', await confirm.getByRole('button', { name: '确认核定', exact: true }).isDisabled());
  await confirm.getByRole('checkbox').check(); await confirm.getByRole('button', { name: '确认核定', exact: true }).click(); await confirm.waitFor({ state: 'hidden' });
  await detail.getByText('已核定', { exact: true }).waitFor();
  check('手机核定后草稿编辑与上传入口关闭', await detail.getByRole('button', { name: '编辑草稿', exact: true }).count() === 0 && await detail.getByRole('button', { name: '上传政策文件', exact: true }).count() === 0);
  await screenshot(detail, 'mobile-confirmed', 320); evidence.mobile = true;
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  const lostCode = `${marker}_lost`; editor = await openEditor(lostCode); let intercepted = false;
  const routePattern = '**/api/hr/severance-rule';
  await hr.route(routePattern, async route => {
    if (!intercepted && route.request().method() === 'POST') { intercepted = true; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); }
    else await route.continue();
  });
  try {
    await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
    await editor.getByRole('button', { name: '核对已保存政策', exact: true }).waitFor();
    check('保存响应丢失后输入仍在且不重复提交', intercepted && await editor.getByLabel('政策编号', { exact: false }).inputValue() === lostCode && await editor.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    await editor.getByRole('button', { name: '核对已保存政策', exact: true }).click();
    await editor.getByRole('button', { name: '查看已保存政策', exact: true }).waitFor(); await screenshot(editor, 'mobile-lost-response', 320);
    await editor.getByRole('button', { name: '查看已保存政策', exact: true }).click(); await detail.getByText(lostCode, { exact: true }).waitFor();
    check('按原编号恢复唯一已保存政策', database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=100000 AND rule_code=${literal(lostCode)};`) === '1'); evidence.lostResponse = true;
  } finally { await hr.unroute(routePattern); }
  await visit(peer, 320); await peer.waitForTimeout(1500);
  check('普通员工手机无政策新增入口', await peer.getByRole('button', { name: '新增政策', exact: true }).count() === 0);
  await visit(foreign, 1440); await foreign.getByRole('heading', { name: '离职补偿政策', exact: true }).waitFor();
  await foreign.getByText('暂无离职补偿政策', { exact: true }).waitFor(); check('外租户同权限页面不显示本租户政策', await foreign.getByText(code, { exact: true }).count() === 0);
  check('政策双端没有页面运行错误', errors.length === 0);
}
