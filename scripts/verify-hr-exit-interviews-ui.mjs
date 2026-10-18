import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyExitInterviewInterface(context) {
  const { admin, peer, subject, person, applicationId, interviewerName, database, check, directory, caseTag, evidence } = context;
  const output = path.join(directory, `h2-exit-interview-ui-${caseTag}`);
  await fs.mkdir(output, { recursive: true });
  const origin = new URL(admin.url()).origin;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const errors = [];
  for (const actor of [admin, peer, subject]) actor.on('pageerror', error => errors.push(error.message));
  const visit = async (actor, width) => {
    await actor.setViewportSize({ width, height: 1100 });
    await actor.goto(`${origin}/hr/exit-interviews`, { waitUntil: 'domcontentloaded' });
  };
  const workspace = admin.locator('.exit-interviews').first();
  const select = async (dialog, label, option) => {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await admin.getByRole('option', { name: option, exact: true }).click();
  };
  const screenshot = async (scope, name, width) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')].filter(control => control.getClientRects().length)
        .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    check(`${name} ${width}px无横向溢出且触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`) });
  };
  const openEditor = async comment => {
    await workspace.getByRole('button', { name: '记录面谈', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '记录离职面谈', exact: true });
    await dialog.getByLabel('搜索离职员工或申请单号').fill(person.username);
    await select(dialog, '离职申请', `${person.username} · exit_${caseTag} · 2026-09-30`);
    await select(dialog, '面谈人', interviewerName);
    await dialog.getByLabel('面谈时间').fill('2026-09-01T10:30');
    await dialog.getByLabel('面谈地点').fill(`ui_${caseTag}`);
    await dialog.getByLabel('内部面谈意见').fill(comment);
    return dialog;
  };
  await visit(admin, 1440);
  await workspace.getByRole('heading', { name: '离职面谈', exact: true }).waitFor();
  await workspace.getByLabel('搜索离职员工姓名').fill(person.username);
  await workspace.getByRole('button', { name: '查看面谈', exact: true }).first().waitFor();
  await screenshot(workspace, 'desktop-list', 1440);
  let dialog = await openEditor(`ui_private_${caseTag}`);
  await screenshot(dialog, 'desktop-editor', 1440);
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const detail = admin.getByRole('dialog', { name: '离职面谈详情', exact: true });
  await detail.getByText(`ui_private_${caseTag}`, { exact: true }).waitFor();
  const identifier = database(`SELECT interview_id FROM hr_exit_interview WHERE tenant_id=100000 AND lifecycle_application_id=${applicationId} AND manager_comment=${literal(`ui_private_${caseTag}`)};`);
  assert.match(identifier, /^[1-9]\d*$/);
  check('电脑页面按员工和面谈人姓名保存真实草稿', database(`SELECT COUNT(*) FROM hr_exit_interview WHERE tenant_id=100000 AND interview_id=${identifier} AND employee_id=${person.employeeId} AND status='DRAFT';`) === '1');
  evidence.desktop = true;
  await admin.setViewportSize({ width: 320, height: 1100 });
  await detail.getByRole('button', { name: '编辑草稿', exact: true }).click();
  dialog = admin.getByRole('dialog', { name: '编辑离职面谈', exact: true });
  await dialog.getByLabel('面谈地点').fill('');
  await dialog.getByLabel('内部面谈意见').fill('');
  await screenshot(dialog, 'mobile-editor', 320);
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await detail.getByLabel('上传面谈附件').waitFor();
  check('手机页面清空可选意见实际保存为空', database(`SELECT COUNT(*) FROM hr_exit_interview WHERE tenant_id=100000 AND interview_id=${identifier} AND location IS NULL AND manager_comment IS NULL;`) === '1');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const fileName = `ui_${caseTag}.pdf`;
  const upload = async () => {
    await detail.getByLabel('上传面谈附件').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdf });
    await detail.getByText(fileName, { exact: true }).waitFor();
  };
  await upload();
  const downloaded = admin.waitForEvent('download');
  await detail.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloaded;
  const bytes = await fs.readFile(await download.path());
  check('手机附件实际下载文件名与字节完整', download.suggestedFilename() === fileName && createHash('sha256').update(bytes).digest('hex') === createHash('sha256').update(pdf).digest('hex'));
  await detail.getByRole('button', { name: '移除', exact: true }).click();
  await detail.getByText('尚未上传附件。', { exact: true }).waitFor();
  check('手机草稿移除附件实际解除绑定', database(`SELECT JSON_LENGTH(attachment_file_ids) FROM hr_exit_interview WHERE tenant_id=100000 AND interview_id=${identifier};`) === '0');
  await upload();
  await detail.getByRole('button', { name: '确认面谈', exact: true }).click();
  dialog = admin.getByRole('dialog', { name: '确认离职面谈', exact: true });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '确认面谈', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await detail.getByText('面谈已确认，意见和附件保留原记录。', { exact: true }).waitFor();
  check('确认后手机页面只读并保留附件', await detail.getByRole('button', { name: '编辑草稿', exact: true }).count() === 0 && await detail.getByLabel('上传面谈附件').count() === 0 && await detail.getByRole('button', { name: '下载', exact: true }).count() === 1);
  await screenshot(detail, 'mobile-confirmed', 320);
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await screenshot(workspace, 'mobile-list', 320);
  evidence.mobile = true;
  let posted = 0;
  const lostComment = `ui_lost_${caseTag}`;
  dialog = await openEditor(lostComment);
  const lostResponse = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posted += 1;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).code, 200);
    await route.abort('connectionfailed');
  };
  await admin.route('**/api/hr/exit-interview', lostResponse);
  try {
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
    await dialog.getByRole('button', { name: '核对已保存记录', exact: true }).waitFor();
    check('真实保存后丢失响应时保留输入并禁止再次提交', await dialog.getByLabel('内部面谈意见').inputValue() === lostComment && await dialog.getByLabel('内部面谈意见').isDisabled() && await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: '核对已保存记录', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await workspace.getByLabel('搜索离职员工姓名').fill(person.username);
    await workspace.getByRole('button', { name: '查看面谈', exact: true }).first().click();
    await detail.getByText(lostComment, { exact: true }).waitFor();
    check('重新读取真实已存记录且没有重复创建', posted === 1 && database(`SELECT COUNT(*) FROM hr_exit_interview WHERE tenant_id=100000 AND lifecycle_application_id=${applicationId} AND manager_comment=${literal(lostComment)};`) === '1');
    await detail.getByRole('button', { name: '关闭', exact: true }).click();
  } finally { await admin.unroute('**/api/hr/exit-interview', lostResponse); }
  evidence.lostResponse = true;
  const failedRead = route => route.abort('connectionfailed');
  await admin.route('**/api/hr/exit-interview/list*', failedRead);
  try {
    await workspace.getByRole('button', { name: '刷新', exact: true }).click();
    await workspace.getByText('面谈列表读取失败', { exact: true }).waitFor();
    check('列表读取失败后不展示旧意见或误报空清单', await workspace.getByRole('button', { name: '查看面谈', exact: true }).count() === 0);
  } finally { await admin.unroute('**/api/hr/exit-interview/list*', failedRead); }
  await workspace.getByRole('button', { name: '重新读取', exact: true }).click();
  await workspace.getByRole('button', { name: '查看面谈', exact: true }).first().waitFor();
  await visit(peer, 320);
  await peer.getByText('您没有访问此页面的权限', { exact: true }).waitFor();
  check('普通员工手机直达地址不能查看内部面谈', await peer.getByRole('button', { name: '记录面谈', exact: true }).count() === 0);
  await visit(subject, 320);
  const ownWorkspace = subject.locator('.exit-interviews').first();
  await ownWorkspace.getByLabel('搜索离职员工姓名').fill(person.username);
  await ownWorkspace.getByText('暂无离职面谈', { exact: true }).waitFor();
  check('管理员角色离职对象手机页面回避本人面谈', await ownWorkspace.getByRole('button', { name: '查看面谈', exact: true }).count() === 0);
  check('双端页面没有未处理脚本异常', errors.length === 0);
  evidence.uiComplete = true;
}
