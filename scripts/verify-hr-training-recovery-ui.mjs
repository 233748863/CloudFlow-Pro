import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyTrainingRecoveryInterface(context) {
  const { hr, peer, subject, person, enrollmentId, database, check, directory, caseTag, evidence } = context;
  const output = path.join(directory, `h2-training-recovery-ui-${caseTag}`);
  await fs.mkdir(output, { recursive: true });
  const origin = new URL(hr.url()).origin;
  const marker = `training_${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const errors = [];
  for (const actor of [hr, peer, subject]) actor.on('pageerror', error => errors.push(error.message));
  const visit = async (actor, width) => {
    await actor.setViewportSize({ width, height: 1100 });
    await actor.goto(`${origin}/hr/training-recoveries`, { waitUntil: 'domcontentloaded' });
  };
  const workspace = hr.locator('.training-recoveries').first();
  const screenshot = async (scope, name, width) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')].filter(control => control.getClientRects().length)
        .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    check(`${name} ${width}px无横向溢出且触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`) });
  };
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n%UI agreement\n');
  const fileName = `ui_${marker}.pdf`;
  const openEditor = async (reason, bytes = pdf) => {
    await workspace.getByRole('button', { name: '新增核定', exact: true }).click();
    const dialog = hr.getByRole('dialog', { name: '新增培训追偿核定', exact: true });
    await dialog.getByLabel('搜索培训员工姓名').fill(person.username);
    await dialog.getByRole('button', { name: '培训报名', exact: true }).click();
    await hr.getByRole('option', { name: `${person.username} · ${marker} · ${marker}`, exact: true }).click();
    await dialog.getByLabel('培训协议', { exact: false }).setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: bytes });
    await dialog.getByLabel('核定可追偿金额（元）', { exact: false }).fill('123.45');
    await dialog.getByLabel('核定依据及原因', { exact: false }).fill(reason);
    return dialog;
  };
  await visit(hr, 1440);
  await workspace.getByRole('heading', { name: '培训追偿核定', exact: true }).waitFor();
  await workspace.getByLabel('搜索培训员工姓名').fill(person.username);
  await workspace.getByRole('button', { name: '查看核定', exact: true }).first().waitFor();
  await screenshot(workspace, 'hr-desktop-list', 1440);
  let dialog = await openEditor(`ui_assessment_${caseTag}`);
  await dialog.getByLabel('核定可追偿金额（元）', { exact: false }).fill('0.001');
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  check('不足一分钱的输入保留表单且没有上传协议', await dialog.isVisible() && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_name=${literal(fileName)};`) === '0');
  await dialog.getByLabel('核定可追偿金额（元）', { exact: false }).fill('123.45');
  await screenshot(dialog, 'hr-desktop-editor', 1440);
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const detail = hr.getByRole('dialog', { name: '培训追偿核定详情', exact: true });
  await detail.getByText(`ui_assessment_${caseTag}`, { exact: true }).waitFor();
  const identifier = database(`SELECT recovery_id FROM hr_training_recovery WHERE tenant_id=100000 AND enrollment_id=${enrollmentId} AND assessment_reason=${literal(`ui_assessment_${caseTag}`)};`);
  assert.match(identifier, /^[1-9]\d*$/);
  check('普通HR通过电脑页面保存实际培训、协议和核定金额', database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${identifier} AND employee_id=${person.employeeId} AND assessed_amount=123.45 AND collected_amount=0 AND status='DRAFT';`) === '1');
  evidence.desktop = true;
  await hr.setViewportSize({ width: 320, height: 1100 });
  await detail.getByRole('button', { name: '编辑草稿', exact: true }).click();
  dialog = hr.getByRole('dialog', { name: '编辑追偿草稿', exact: true });
  await dialog.getByLabel('核定依据及原因', { exact: false }).fill('');
  check('清空必填依据后页面禁止保存且原记录未变', await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled() && database(`SELECT version FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${identifier};`) === '0');
  await dialog.getByLabel('核定依据及原因', { exact: false }).fill(`ui_updated_${caseTag}`);
  await dialog.getByLabel('核定可追偿金额（元）', { exact: false }).fill('120.00');
  await screenshot(dialog, 'hr-mobile-editor', 320);
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await detail.getByText(`ui_updated_${caseTag}`, { exact: true }).waitFor();
  check('手机编辑的金额与依据实际保存', database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${identifier} AND assessed_amount=120 AND assessment_reason=${literal(`ui_updated_${caseTag}`)} AND version=1;`) === '1');
  const downloadEvent = hr.waitForEvent('download');
  await detail.getByRole('button', { name: '下载协议', exact: true }).click();
  const download = await downloadEvent;
  check('手机实际下载协议文件名和字节完整', download.suggestedFilename() === fileName && createHash('sha256').update(await fs.readFile(await download.path())).digest('hex') === createHash('sha256').update(pdf).digest('hex'));
  await detail.getByRole('button', { name: '确认核定', exact: true }).click();
  dialog = hr.getByRole('dialog', { name: '确认培训追偿核定', exact: true });
  check('核定前必须确认已核对协议与金额', await dialog.getByRole('button', { name: '确认核定', exact: true }).isDisabled());
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '确认核定', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await detail.getByText('当前记录只读，金额及协议保留原核定依据。', { exact: true }).waitFor();
  check('核定后手机页面只读且没有冒充已收款', await detail.getByRole('button', { name: '编辑草稿', exact: true }).count() === 0 && database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${identifier} AND status='CONFIRMED' AND collected_amount=0 AND settlement_id IS NULL;`) === '1');
  await screenshot(detail, 'hr-mobile-confirmed', 320);
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await screenshot(workspace, 'hr-mobile-list', 320);
  evidence.mobile = true;
  const lostReason = `ui_lost_${caseTag}`;
  dialog = await openEditor(lostReason, Buffer.concat([pdf, Buffer.from('%UI supplementary agreement\n')]));
  let posted = 0;
  const lostResponse = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posted += 1;
    const response = await route.fetch();
    assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200);
    await route.abort('connectionfailed');
  };
  await hr.route('**/api/hr/training-recovery', lostResponse);
  try {
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
    await dialog.getByRole('button', { name: '核对已保存记录', exact: true }).waitFor();
    check('真实保存后响应丢失保留输入并禁止重复提交', await dialog.getByLabel('核定依据及原因', { exact: false }).inputValue() === lostReason && await dialog.getByLabel('核定依据及原因', { exact: false }).isDisabled() && await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: '核对已保存记录', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await workspace.getByLabel('搜索培训员工姓名').fill(person.username);
    await workspace.getByRole('button', { name: '查看核定', exact: true }).first().click();
    await detail.getByText(lostReason, { exact: true }).waitFor();
    check('实际读取已保存核定且没有新增重复追偿', posted === 1 && database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND enrollment_id=${enrollmentId} AND assessment_reason=${literal(lostReason)};`) === '1');
    await detail.getByRole('button', { name: '关闭', exact: true }).click();
  } finally { await hr.unroute('**/api/hr/training-recovery', lostResponse); }
  evidence.lostResponse = true;
  const failedRead = route => route.abort('connectionfailed');
  await hr.route('**/api/hr/training-recovery/list*', failedRead);
  try {
    await workspace.getByRole('button', { name: '刷新', exact: true }).click();
    await workspace.getByText('核定列表读取失败', { exact: true }).waitFor();
    check('读取失败不会显示旧金额或误报空结果', await workspace.getByRole('button', { name: '查看核定', exact: true }).count() === 0);
  } finally { await hr.unroute('**/api/hr/training-recovery/list*', failedRead); }
  await workspace.getByRole('button', { name: '重新读取', exact: true }).click();
  await workspace.getByRole('button', { name: '查看核定', exact: true }).first().waitFor();
  await visit(peer, 320);
  await peer.getByText('您没有访问此页面的权限', { exact: true }).waitFor();
  check('普通员工手机直达页面不能查看追偿核定', await peer.getByRole('button', { name: '新增核定', exact: true }).count() === 0);
  await visit(subject, 320);
  const own = subject.locator('.training-recoveries').first();
  await own.getByLabel('搜索培训员工姓名').fill(person.username);
  await own.getByText('暂无培训追偿核定', { exact: true }).waitFor();
  check('管理员角色的培训对象手机页面回避本人核定', await own.getByRole('button', { name: '查看核定', exact: true }).count() === 0);
  check('培训追偿双端没有未处理页面异常', errors.length === 0);
  evidence.uiComplete = true;
}
