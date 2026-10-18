import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';

export async function verifyHrAppraisalInterface(context) {
  const { hr, employee, peer, cycleId, cycleName, participants, database, check, directory, caseTag, evidence } = context;
  const first = participants[0];
  const reviewer = participants[2];
  const origin = new URL(hr.url()).origin;
  const output = path.join(directory, `h2-appraisal-ui-${caseTag}`);
  await fs.mkdir(output, { recursive: true });
  const errors = [];
  for (const page of [hr, employee, peer]) page.on('pageerror', error => errors.push(error.message));
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const button = (scope, name) => scope.getByRole('button', { name, exact: true }).filter({ visible: true });
  const field = (scope, label) => scope.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\*)?$`));
  const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });
  const close = async scope => { await button(scope, '关闭弹窗').click(); await scope.waitFor({ state: 'hidden' }); };
  const choose = async (page, scope, label, choice) => { await button(scope, label).click(); await page.getByRole('option', { name: choice, exact: true }).click(); };
  const visit = async (page, route, title, width = 1440) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.appraisal-workspace').first().getByRole('heading', { name: title, exact: true }).waitFor();
  };
  const screenshot = async (page, name, width, scope = page.locator('.appraisal-workspace').first()) => {
    await page.locator('.cf-toast-viewport').waitFor({ state: 'hidden', timeout: 15000 });
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')].filter(control => control.getClientRects().length)
        .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height,
          left: control.getBoundingClientRect().left, right: control.getBoundingClientRect().right,
          label: control.getAttribute('aria-label') || control.textContent.trim().slice(0, 30) })) }));
    console.log(`H2_APPRAISAL_LAYOUT ${JSON.stringify({ name, width, ...layout })}`);
    check(`${name} ${width}px无横向溢出且触控区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0
      && layout.controls.every(control => control.width >= 44 && control.height >= 44 && control.left >= Math.max(0, layout.left) && control.right <= Math.min(layout.viewport, layout.right)));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`), animations: 'disabled' });
  };
  const openCycle = async (page, name) => { await page.getByLabel('周期名称搜索', { exact: true }).fill(name); await button(page, `查看${name}详情`).click(); return dialog(page, name); };
  for (const width of [1440, 320]) {
    await visit(employee, '/hr/ess/appraisals', '我的绩效周期', width);
    let detail = await openCycle(employee, cycleName);
    await detail.getByRole('heading', { name: '本人最终结果', exact: true }).waitFor();
    check(`本人详情${width}px不展示其他员工与内部校准操作`, !await detail.getByText(participants[1].username, { exact: true }).count()
      && !await detail.getByText(reviewer.username, { exact: true }).count() && !await detail.getByRole('button', { name: '校准结果', exact: true }).count());
    await screenshot(employee, 'own-completed-detail', width, detail);
    await close(detail);
    await screenshot(employee, 'own-cycles', width);
    await visit(hr, '/hr/appraisal-cycles', '绩效周期', width);
    detail = await openCycle(hr, cycleName);
    await detail.getByRole('heading', { name: '参评名单与结果', exact: true }).waitFor();
    check(`完成周期${width}px不显示管理写入按钮`, await detail.getByRole('button', { name: /计算周期总分|登记目标评分|推进下一阶段|校准结果|新增校准会议/ }).count() === 0);
    await screenshot(hr, 'management-completed-detail', width, detail);
    await close(detail);
    await screenshot(hr, 'management-cycles', width);
    evidence[width === 1440 ? 'desktop' : 'mobile'] = true;
  }
  await visit(hr, '/hr/appraisal-cycles', '绩效周期', 320);
  await button(hr, '创建绩效周期').click();
  let editor = dialog(hr, '创建绩效周期');
  const uiName = `H2页面_${caseTag}`;
  await field(editor, '周期名称').fill(uiName);
  await field(editor, '开始日期').fill('2026-07-01');
  await field(editor, '结束日期').fill('2026-09-30');
  await field(editor, '核定评分上界').fill('100');
  await choose(hr, editor, '总分计算方式', '受限公式');
  await field(editor, '得分公式').fill('${customerScore}');
  await editor.getByRole('group', { name: '部门范围', exact: true }).getByRole('checkbox', { name: cycleName, exact: true }).check();
  await editor.getByRole('group', { name: '岗位范围', exact: true }).getByRole('checkbox', { name: `ap_a_${caseTag}`, exact: true }).check();
  await editor.getByRole('group', { name: '职级范围', exact: true }).getByRole('checkbox', { name: `ap_a_${caseTag}`, exact: true }).check();
  await button(editor, '保存周期草稿').click();
  await editor.getByRole('alert').waitFor();
  check('客户评分配置被真实接口拒绝且页面保留草稿', await field(editor, '周期名称').inputValue() === uiName
    && database(`SELECT COUNT(*) FROM hr_appraisal_cycle WHERE cycle_name=${literal(uiName)};`) === '0');
  await field(editor, '得分公式').fill('${goalScore}*0.8+${selfScore}*0.2');
  await screenshot(hr, 'draft-form', 320, editor);
  await hr.waitForTimeout(5100);
  await button(editor, '保存周期草稿').click();
  await editor.waitFor({ state: 'hidden' });
  let detail = dialog(hr, uiName);
  await button(detail, '推进下一阶段').waitFor();
  const uiId = database(`SELECT cycle_id FROM hr_appraisal_cycle WHERE tenant_id=100000 AND cycle_name=${literal(uiName)};`);
  assert.match(uiId, /^[1-9]\d*$/);
  const advance = async status => {
    await button(detail, '推进下一阶段').click();
    const transition = dialog(hr, '推进绩效阶段');
    if (status === 'ONGOING') await transition.getByText('实际参评 1 人', { exact: true }).waitFor();
    await transition.getByRole('checkbox', { name: '我已核对当前条件，同意按顺序推进并冻结对应依据。', exact: true }).check();
    await button(transition, '确认推进').click();
    await transition.waitFor({ state: 'hidden' });
    check(`页面实际推进至${status}`, database(`SELECT status FROM hr_appraisal_cycle WHERE cycle_id=${uiId};`) === status);
  };
  await advance('ONGOING');
  await button(detail, '下达周期目标').click();
  editor = dialog(hr, '下达周期目标');
  const goalName = `页面目标_${caseTag}`;
  await field(editor, '目标名称').fill(goalName);
  await choose(hr, editor, '节点1承担人或部门', `${first.username} · ${first.username}`);
  await field(editor, '节点1目标值').fill('100');
  await screenshot(hr, 'goal-form', 320, editor);
  await button(editor, '确认提交').click(); await editor.waitFor({ state: 'hidden' });
  await advance('SCORING');
  await button(detail, `登记${first.username}${goalName}评分`).click();
  editor = dialog(hr, '登记目标评分');
  await field(editor, '目标得分').fill('101');
  await field(editor, '评分依据').fill('页面核实真实目标');
  await button(editor, '确认提交').click(); await editor.getByRole('alert').waitFor();
  check('目标评分越界时保留输入并拒绝写入', await field(editor, '目标得分').inputValue() === '101'
    && database(`SELECT COUNT(*) FROM hr_performance_result result JOIN hr_performance_objective objective ON objective.id=result.objective_id WHERE objective.cycle_id=${uiId};`) === '0');
  await field(editor, '目标得分').fill('80');
  await hr.waitForTimeout(5100);
  await button(editor, '确认提交').click(); await editor.waitFor({ state: 'hidden' });
  const calculate = async () => { await hr.waitForTimeout(5100); await button(detail, '计算周期总分').click(); const form = dialog(hr, '计算周期总分'); await button(form, '读取并计算').click(); await form.waitFor({ state: 'hidden' }); };
  await calculate();
  await detail.getByText(/缺少公式输入.*selfScore/).waitFor();
  check('页面保留逐人缺项反馈且没有默认补零', database(`SELECT COUNT(*) FROM hr_appraisal_result WHERE cycle_id=${uiId} AND calculated_score IS NOT NULL;`) === '0');
  await button(detail, '评价邀请').click();
  const invitations = dialog(hr, '评价邀请');
  await button(invitations, '邀请员工评价').click();
  editor = dialog(hr, '邀请员工评价');
  check('邀请表单明确显示客户停用且没有客户编号输入', await editor.getByText('客户评分已停用；接入真实客户身份后启用。', { exact: true }).isVisible()
    && await editor.getByPlaceholder(/客户.*ID/).count() === 0);
  await button(editor, '确认邀请').click(); await editor.waitFor({ state: 'hidden' });
  const invitationId = database(`SELECT evaluator.id FROM hr_perf_evaluator evaluator JOIN hr_performance_objective objective ON objective.id=evaluator.objective_id WHERE objective.cycle_id=${uiId} AND evaluator.evaluator_source='SELF';`);
  assert.match(invitationId, /^[1-9]\d*$/);
  check('管理邀请页面没有替他人提交评分按钮', await invitations.getByRole('button', { name: /提交.*评分/ }).count() === 0);
  await close(invitations);
  await visit(employee, '/hr/ess/appraisals', '我的绩效周期', 320);
  await button(employee, '受邀评分').click();
  await employee.getByLabel('搜索受邀周期或被评人', { exact: true }).fill(uiName);
  await button(employee, `评分${uiName}邀请`).click();
  editor = dialog(employee, '提交本人受邀评分');
  await field(editor, '本人评价得分').fill('0.001');
  const note = `页面本人零分_${caseTag}`;
  await field(editor, '本人评价依据').fill(note);
  await button(editor, '提交本人评分').click(); await editor.getByRole('alert').waitFor();
  check('本人评分精度错误保留输入且未写入', await field(editor, '本人评价得分').inputValue() === '0.001'
    && database(`SELECT COUNT(*) FROM hr_perf_evaluator_response WHERE evaluator_id=${invitationId};`) === '0');
  await field(editor, '本人评价得分').fill('0');
  await employee.waitForTimeout(5100);
  let posts = 0;
  const endpoint = `**/api/hr/appraisal-cycle/invitations/mine/${invitationId}/response`;
  const loseResponse = captureOwnedLostResponse(() => {
    posts += 1;
  });
  await employee.route(endpoint, loseResponse.handler);
  try {
    await button(editor, '提交本人评分').click();
    await editor.getByText('本次提交结果尚未确认，已暂停再次提交。', { exact: false }).waitFor();
    check('真实响应丢失后保留输入且禁止直接重发', await field(editor, '本人评价得分').inputValue() === '0'
      && await field(editor, '本人评价依据').inputValue() === note && await field(editor, '本人评价依据').isDisabled()
      && await button(editor, '提交本人评分').isDisabled());
    await button(editor, '核对提交结果').click();
    await editor.waitFor({ state: 'hidden' });
    editor = dialog(employee, '本人评价记录');
    await editor.getByText('已确认服务器保存了本次评分，无需再次提交。', { exact: true }).waitFor();
    check('真实读取本人结果确认零分且没有重复写入', posts === 1 && database(`SELECT COUNT(*) FROM hr_perf_evaluator_response WHERE evaluator_id=${invitationId} AND score=0 AND comment_text=${literal(note)};`) === '1');
    check('核对成功后仅显示真实只读结果且清除旧未确认提示', await editor.getByRole('alert').count() === 0
      && await editor.getByText('邀请：待评分', { exact: false }).count() === 0 && await button(editor, '提交本人评分').count() === 0
      && await editor.getByText('本次提交结果尚未确认', { exact: false }).count() === 0 && await editor.getByText(note, { exact: true }).count() === 1);
    await screenshot(employee, 'own-response-recovery', 320, editor);
    evidence.lostResponse = true;
  } finally {
    try { await employee.unroute(endpoint, loseResponse.handler); }
    finally { loseResponse.assertSucceeded(); }
  }
  await close(editor);
  await choose(employee, employee.locator('.appraisal-workspace').first(), '邀请状态', '已提交');
  await button(employee, `查看${uiName}邀请`).click();
  editor = dialog(employee, '本人评价记录');
  await editor.getByText(note, { exact: true }).waitFor(); await close(editor);
  await button(detail, '刷新周期详情').click();
  await calculate();
  await detail.getByText(new RegExp(`${first.username}：计算原分 64`)).waitFor();
  check('页面计算读取真实零分来源得到64分', Number(database(`SELECT calculated_score FROM hr_appraisal_result WHERE cycle_id=${uiId};`)) === 64);
  await advance('CALIBRATING');
  await button(detail, `校准${first.username}结果`).click();
  editor = dialog(hr, '校准员工结果');
  await field(editor, '最终等级').fill('A');
  await field(editor, '校准原因').fill('页面核对最终结果');
  await screenshot(hr, 'calibration-form', 320, editor);
  await button(editor, '确认提交').click(); await editor.waitFor({ state: 'hidden' });
  await button(detail, '新增校准会议').click();
  editor = dialog(hr, '新增校准会议');
  await field(editor, '会议名称').fill(`页面会议_${caseTag}`);
  await field(editor, '会议时间').fill('2026-09-25T16:30');
  await field(editor, '会议地点').fill('隔离页面验收');
  const pickPerson = async (label, person) => {
    await button(editor, label).click();
    const picker = dialog(hr, '选择授权范围内人员');
    await picker.getByLabel('人员姓名或工号', { exact: true }).fill(person.username);
    await button(picker, `选择${person.username}`).click(); await picker.waitFor({ state: 'hidden' });
  };
  await pickPerson('主持人', reviewer);
  await pickPerson('添加参会人', reviewer);
  await pickPerson('添加参会人', first);
  await field(editor, '会议议程').fill('核对实际评分与等级');
  await screenshot(hr, 'meeting-form', 320, editor);
  await button(editor, '确认提交').click(); await editor.waitFor({ state: 'hidden' });
  check('页面会议保存同租户真实用户关联和统一时间格式', database(`SELECT COUNT(*) FROM hr_talent_calibration_session WHERE cycle_id=${uiId} AND review_id IS NULL AND facilitator_id=${reviewer.userId} AND scheduled_at='2026-09-25 16:30:00';`) === '1');
  await button(detail, '维护会议').click();
  editor = dialog(hr, '维护校准会议');
  check('回读会议时间可继续编辑', await field(editor, '会议时间').inputValue() === '2026-09-25T16:30');
  await choose(hr, editor, '会议状态', '已完成');
  await field(editor, '会议纪要').fill('已核对各项实际评分');
  await button(editor, '确认提交').click(); await editor.waitFor({ state: 'hidden' });
  await advance('COMPLETED');
  await detail.getByText(/周期已.*完成，所有关联依据只读/).waitFor();
  check('页面完成后刷新为只读且不保留旧管理按钮', await detail.getByRole('button', { name: /计算周期总分|登记目标评分|推进下一阶段|校准.*结果|新增校准会议|维护会议/ }).count() === 0);
  check('页面完整闭环不改写计算原分', database(`SELECT CONCAT(calculated_score,':',final_score,':',grade) FROM hr_appraisal_result WHERE cycle_id=${uiId};`) === '64.0000:64.0000:A');
  await screenshot(hr, 'ui-completed-detail', 320, detail);
  const finalScore = detail.getByText('64.0000 / 64.0000', { exact: true }).filter({ visible: true });
  await finalScore.scrollIntoViewIfNeeded();
  check('手机滚动后能查看完成周期原分与最终分64分', await finalScore.isVisible());
  await screenshot(hr, 'ui-completed-result', 320, detail);
  await visit(peer, '/hr/ess/appraisals', '我的绩效周期', 320);
  await button(peer, '受邀评分').click();
  await peer.getByLabel('搜索受邀周期或被评人', { exact: true }).fill(uiName);
  await peer.getByText('暂无记录', { exact: true }).waitFor();
  check('未受邀员工看不到页面新建邀请', await peer.getByRole('button', { name: `评分${uiName}邀请`, exact: true }).count() === 0);
  check('绩效页面无浏览器运行异常', errors.length === 0);
  check('原已完成周期保持完成态', database(`SELECT status FROM hr_appraisal_cycle WHERE cycle_id=${cycleId};`) === 'COMPLETED');
  evidence.uiLifecycle = true;
  console.log(`H2_APPRAISAL_UI_EVIDENCE=${output}`);
}
