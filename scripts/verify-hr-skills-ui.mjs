import fs from 'node:fs/promises';
import path from 'node:path';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';

export async function verifyHrSkillInterface(context) {
  const { employee, hr, employeeIdentity, skillId, skillName, levels, positionId, positionCode, courseId, courseCode, database, check, directory, caseTag, evidence } = context;
  const output = path.join(directory, `h2-skill-ui-${caseTag}`);
  await fs.mkdir(output, { recursive: true });
  const origin = new URL(employee.url()).origin;
  const errors = [];
  employee.on('pageerror', error => errors.push(error.message));
  hr.on('pageerror', error => errors.push(error.message));
  const visit = async (page, route, title, width = 1440) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.skill-workspace').first().getByRole('heading', { name: title, exact: true }).waitFor();
  };
  const pick = async (page, label, title, keyword, name) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    const lookup = page.getByRole('dialog', { name: title, exact: true });
    await lookup.getByLabel('名称或工号搜索').fill(keyword);
    await lookup.getByRole('button', { name: `选择${name}`, exact: true }).click();
    await lookup.waitFor({ state: 'hidden' });
  };
  const select = async (page, scope, label, option) => {
    await scope.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const screenshot = async (page, name, width, scope = page.locator('.skill-workspace').first()) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')].filter(control => control.getClientRects().length)
        .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height, label: control.getAttribute('aria-label') || control.textContent.trim().slice(0, 30) })) }));
    console.log(`H2_SKILL_LAYOUT ${JSON.stringify({ name, width, ...layout })}`);
    check(`${name} ${width}px无横向溢出且可见触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`) });
  };
  await visit(hr, '/hr/skills', '技能目录', 320);
  await hr.getByRole('button', { name: '新增技能', exact: true }).click();
  let dialog = hr.getByRole('dialog', { name: '新增技能', exact: true });
  const uiCode = `H2_UI_${caseTag}`;
  await dialog.getByLabel('技能编码').fill(uiCode);
  await dialog.getByLabel('技能名称').fill(`${uiCode}技能`);
  await select(hr, dialog, '状态', '启用');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  check('缺少等级定义时页面保留草稿且未创建技能', await dialog.isVisible() && database(`SELECT COUNT(*) FROM hr_skill WHERE tenant_id=100000 AND skill_code='${uiCode}';`) === '0');
  for (const [level, description] of Object.entries(levels)) await dialog.getByLabel(`${level} 级定义`).fill(description);
  await screenshot(hr, 'definition-dialog', 320, dialog);
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check('通过真实页面创建并保存全部五级定义', database(`SELECT COUNT(*) FROM hr_skill WHERE tenant_id=100000 AND skill_code='${uiCode}' AND status='ACTIVE';`) === '1');
  await hr.getByRole('button', { name: '岗位要求', exact: true }).click();
  await hr.getByLabel('岗位名称').fill(positionCode);
  await hr.getByRole('button', { name: `配置${positionCode}技能要求`, exact: true }).click();
  dialog = hr.getByRole('dialog', { name: `${positionCode} · 岗位技能要求`, exact: true });
  await dialog.getByLabel(`${skillName}权重`).fill('0.5');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  check('岗位权重校验失败保留原输入且数据库不变', await dialog.getByLabel(`${skillName}权重`).inputValue() === '0.5' && database(`SELECT version FROM hr_position WHERE id=${positionId};`) === '1');
  await dialog.getByLabel(`${skillName}权重`).fill('1');
  await select(hr, dialog, `${skillName}要求等级`, '5 级');
  await screenshot(hr, 'position-dialog', 320, dialog);
  // Keep the real server's five-second duplicate-submit protection intact.
  await hr.waitForTimeout(5100);
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check('岗位页面真实更新要求等级与版本', database(`SELECT required_level FROM hr_position_skill WHERE tenant_id=100000 AND position_id=${positionId} AND skill_id=${skillId};`) === '5');
  await hr.getByRole('button', { name: '课程目标', exact: true }).click();
  await hr.getByLabel('课程名称').fill(courseCode);
  await hr.getByRole('button', { name: `配置${courseCode}技能目标`, exact: true }).click();
  dialog = hr.getByRole('dialog', { name: `${courseCode} · 技能目标`, exact: true });
  await select(hr, dialog, '完成后的目标等级', '5 级');
  await screenshot(hr, 'course-dialog', 320, dialog);
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check('课程页面真实保存服务器技能目标', database(`SELECT target_level FROM hr_training_course WHERE id=${courseId};`) === '5');
  await visit(employee, '/hr/skills', '技能目录', 320);
  check('普通员工页面不显示技能维护和员工评估入口', await employee.getByRole('button', { name: '新增技能', exact: true }).count() === 0
    && await employee.getByRole('button', { name: '岗位要求', exact: true }).count() === 0 && await employee.getByRole('button', { name: '员工评估', exact: true }).count() === 0);
  await visit(employee, '/hr/ess/skills', '我的技能', 320);
  await employee.getByRole('button', { name: '提交技能自报', exact: true }).click();
  dialog = employee.getByRole('dialog', { name: '提交本人技能自报', exact: true });
  await pick(employee, '技能', '选择已启用技能', caseTag, skillName);
  await select(employee, dialog, '自报等级', '2 级');
  await dialog.getByLabel('依据说明').fill(`丢失响应核对_${caseTag}`);
  await screenshot(employee, 'self-assessment-dialog', 320, dialog);
  let submitted;
  let posts = 0;
  const lostResponse = captureOwnedLostResponse(route => {
    posts += 1;
    submitted = route.request().postDataJSON();
  });
  await employee.route('**/api/hr/skill/self-assessment', lostResponse.handler);
  try {
    await dialog.getByRole('button', { name: '提交审核', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    check('真实提交响应丢失后保留说明并锁定原内容', await dialog.getByLabel('依据说明').inputValue() === `丢失响应核对_${caseTag}` && await dialog.getByLabel('依据说明').isDisabled());
    await dialog.getByRole('button', { name: '核对提交结果', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    check('真实读取恢复提交结果，无重复申请', posts === 1 && database(`SELECT COUNT(*) FROM hr_employee_skill WHERE tenant_id=100000 AND employee_id=${employeeIdentity.employeeId} AND evidence_key='SELF:${employeeIdentity.userId}:${submitted.requestKey}';`) === '1');
  } finally {
    try { await employee.unroute('**/api/hr/skill/self-assessment', lostResponse.handler); }
    finally { lostResponse.assertSucceeded(); }
  }
  evidence.lostResponse = true;
  await visit(hr, '/hr/skills', '技能目录');
  await hr.getByRole('button', { name: '员工评估', exact: true }).click();
  await pick(hr, '员工筛选', '选择管理范围内员工', employeeIdentity.username, employeeIdentity.username);
  await select(hr, hr.locator('.skill-workspace').first(), '评估状态', '待审核');
  await hr.getByRole('button', { name: '审核自报', exact: true }).click();
  dialog = hr.getByRole('dialog', { name: '审核本人技能自报', exact: true });
  await dialog.getByLabel('审核说明').fill(`页面核实_${caseTag}`);
  await screenshot(hr, 'review-dialog', 1440, dialog);
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  check('HR页面审核后本人证据真实生效', database(`SELECT current_level FROM hr_employee_skill WHERE tenant_id=100000 AND employee_id=${employeeIdentity.employeeId} AND skill_id=${skillId} AND current_flag=1;`) === '2');
  for (const width of [1440, 320]) {
    await visit(employee, '/hr/ess/skills', '我的技能', width);
    await employee.getByText('当前有效 2 级', { exact: true }).filter({ visible: true }).waitFor();
    await screenshot(employee, 'mine', width);
    await visit(hr, '/hr/skill-gap', '岗位技能差距', width);
    await hr.getByLabel('员工姓名或工号').fill(employeeIdentity.username);
    await hr.getByRole('button', { name: `查看${employeeIdentity.username}技能差距`, exact: true }).waitFor();
    await screenshot(hr, 'gap', width);
    await visit(hr, '/hr/skills', '技能目录', width);
    await hr.getByLabel('名称搜索').fill(skillName);
    await hr.getByRole('button', { name: `查看${skillName}定义`, exact: true }).waitFor();
    if (width === 320) {
      const search = await hr.getByLabel('名称搜索').boundingBox();
      check('320px手机名称搜索输入宽度至少160px', search !== null && search.width >= 160);
      console.log(`H2_SKILL_MOBILE_SEARCH: viewport=320; input_width=${search.width}`);
    }
    await screenshot(hr, 'catalog', width);
    evidence[width === 1440 ? 'desktop' : 'mobile'] = true;
  }
  check('技能页面无浏览器运行异常', errors.length === 0);
  console.log(`H2_SKILL_UI_EVIDENCE=${output}`);
}
