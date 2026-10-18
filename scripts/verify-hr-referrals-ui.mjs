import path from 'node:path';

export async function approveHrReferralOfferUi({ offerApprover, task, marker, candidateName, directory, check }) {
  const origin = new URL(offerApprover.url()).origin;
  await offerApprover.setViewportSize({ width: 1440, height: 1000 });
  await offerApprover.goto(`${origin}/workflow/task/${task.id}`);
  const dialog = offerApprover.getByRole('dialog');
  const candidate = dialog.getByRole('group', { name: '候选人姓名', exact: true });
  const position = dialog.getByRole('group', { name: '拟聘岗位', exact: true });
  await candidate.getByText(candidateName, { exact: true }).waitFor();
  await position.getByText(marker, { exact: true }).waitFor();
  for (const action of ['转办', '加签', '减签', '驳回']) await dialog.getByRole('button', { name: action, exact: true }).waitFor({ state: 'hidden' });
  check('录用审批页面显示提交时的岗位且隐藏改派入口', await position.getByText(marker, { exact: true }).isVisible()
    && await dialog.getByRole('button', { name: /^(转办|加签|减签|驳回)$/ }).count() === 0);
  await dialog.getByPlaceholder('请输入审批意见...').fill('已核对岗位、薪资与入职日期');
  await offerApprover.screenshot({ path: path.join(directory, `h2-referral-offer-approval-${marker}.png`), fullPage: true });
  await dialog.getByRole('button', { name: '同意', exact: true }).click();
  const completed = offerApprover.waitForResponse(response => response.url().endsWith('/workflow/wf/complete') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const response = await completed;
  const body = await response.json();
  check('录用页面办理未重新提交只读业务字段', Object.keys(response.request().postDataJSON().variables || {}).length === 0);
  check(`管理员在实际待办页面完成录用审批 HTTP=${response.status()} code=${body.code}`, response.status() === 200 && body.code === 200);
}

export async function submitHrReferralBonusUi({ humanResources, employee, marker, referralId, directory, check, periodName, bonus }) {
  const origin = new URL(humanResources.url()).origin;
  await employee.goto(`${origin}/hr/ess/referrals?referralId=${referralId}`);
  const own = employee.getByRole('dialog', { name: '本人推荐详情', exact: true });
  await own.getByText('已入职', { exact: true }).waitFor();
  check('本人看到实际入职结果但无奖金核定入口', await own.getByRole('button', { name: '核定奖金', exact: true }).count() === 0);
  await humanResources.setViewportSize({ width: 1440, height: 1000 });
  await humanResources.goto(`${origin}/hr/referrals?referralId=${referralId}`);
  const detail = humanResources.getByRole('dialog', { name: '推荐办理', exact: true });
  await detail.getByRole('button', { name: '核定奖金', exact: true }).click();
  const form = humanResources.getByRole('dialog', { name: '核定推荐奖金', exact: true });
  await form.getByLabel('奖金金额（元）', { exact: false }).fill(bonus.amount);
  await form.getByLabel('搜索薪资项目', { exact: true }).fill(marker);
  await form.getByRole('button', { name: '薪资项目', exact: true }).click();
  await humanResources.getByRole('option', { name: marker, exact: true }).click();
  await form.getByLabel('搜索发放工资周期', { exact: true }).fill(periodName);
  await form.getByRole('button', { name: '发放工资周期', exact: true }).click();
  await humanResources.getByRole('option', { name: periodName, exact: true }).click();
  await form.getByLabel('奖金条件说明', { exact: false }).fill(bonus.conditionRemark);
  check('奖金条件未确认时页面阻止提交', await form.getByRole('button', { name: '确认提交', exact: true }).isDisabled());
  await humanResources.screenshot({ path: path.join(directory, `h2-referral-bonus-desktop-${marker}.png`), fullPage: true });
  await humanResources.setViewportSize({ width: 320, height: 1050 });
  check('手机奖金表单保留输入且无水平溢出', await form.getByLabel('奖金金额（元）', { exact: false }).inputValue() === bonus.amount
    && await humanResources.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await form.getByRole('checkbox').check();
  await humanResources.screenshot({ path: path.join(directory, `h2-referral-bonus-mobile-${marker}.png`), fullPage: true });
  await form.getByRole('button', { name: '确认提交', exact: true }).click();
  await detail.getByText('奖金审批中', { exact: true }).waitFor();
  check('人事在手机页面实际提交奖金审批', await detail.getByRole('button', { name: '核定奖金', exact: true }).count() === 0);
}

export async function verifyHrReferralsUi({ employee, admin, marker, candidateName, directory, check, pdf }) {
  const origin = new URL(employee.url()).origin;
  await employee.setViewportSize({ width: 1440, height: 1000 });
  await employee.goto(`${origin}/hr/ess/referrals`);
  await employee.getByRole('main').getByRole('heading', { name: '我的推荐', exact: true }).waitFor();
  await employee.getByRole('heading', { name: candidateName, exact: true }).waitFor();
  check('电脑页面显示本人推荐记录', await employee.getByRole('button', { name: '查看推荐', exact: true }).count() === 1);
  await employee.getByRole('button', { name: '推荐候选人', exact: true }).click();
  const form = employee.getByRole('dialog', { name: '推荐候选人', exact: true });
  await form.getByLabel('候选人姓名', { exact: false }).fill(`${marker}_ui`);
  await form.getByLabel('邮箱', { exact: true }).fill(`${marker}_ui@example.test`);
  await form.getByLabel('搜索目标岗位', { exact: true }).fill(marker);
  await form.getByRole('button', { name: '目标岗位', exact: true }).click();
  await employee.getByRole('option', { name: marker, exact: true }).click();
  await form.getByLabel('私有简历', { exact: true }).setInputFiles({ name: `${marker}_ui.pdf`, mimeType: 'application/pdf', buffer: pdf });
  await form.getByText(`已上传：${marker}_ui.pdf`, { exact: true }).waitFor();
  await form.getByLabel('推荐理由', { exact: true }).fill('页面提交的真实推荐');
  await form.getByRole('button', { name: '确认提交', exact: true }).click();
  const detail = employee.getByRole('dialog', { name: '本人推荐详情', exact: true });
  await detail.getByText(`${marker}_ui`, { exact: true }).waitFor();
  check('电脑页面实际上传并提交本人推荐', await detail.getByRole('button', { name: '下载简历', exact: true }).isVisible());
  check('本人详情不显示HR初筛和转换按钮', await detail.getByRole('button', { name: '记录初筛', exact: true }).count() === 0
    && await detail.getByRole('button', { name: '转入招聘', exact: true }).count() === 0);
  await employee.screenshot({ path: path.join(directory, `h2-referral-desktop-${marker}.png`), fullPage: true });
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await employee.setViewportSize({ width: 320, height: 1050 });
  await employee.getByRole('main').getByRole('heading', { name: '我的推荐', exact: true }).waitFor();
  check('手机页面没有水平溢出', await employee.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await employee.screenshot({ path: path.join(directory, `h2-referral-mobile-${marker}.png`), fullPage: true });
  await admin.goto(`${origin}/hr/referrals`);
  await admin.getByRole('main').getByRole('heading', { name: '员工内推管理', exact: true }).waitFor();
  await admin.getByLabel('候选人姓名', { exact: true }).fill(`${marker}_ui`);
  await admin.getByRole('button', { name: '查询', exact: true }).click();
  await admin.getByRole('heading', { name: `${marker}_ui`, exact: true }).waitFor();
  await admin.getByRole('article').filter({ has: admin.getByRole('heading', { name: `${marker}_ui`, exact: true }) })
    .getByRole('button', { name: '查看推荐', exact: true }).click();
  const management = admin.getByRole('dialog', { name: '推荐办理', exact: true });
  await management.getByRole('button', { name: '记录初筛', exact: true }).click();
  const screening = admin.getByRole('dialog', { name: '记录初筛结果', exact: true });
  await screening.getByLabel('初筛说明', { exact: false }).fill('页面核对通过');
  await screening.getByRole('button', { name: '确认提交', exact: true }).click();
  await management.getByRole('button', { name: '转入招聘', exact: true }).waitFor();
  check('人事页面实际记录初筛后显示转换入口', await management.getByText('初筛通过', { exact: true }).isVisible());
  await admin.screenshot({ path: path.join(directory, `h2-referral-management-${marker}.png`), fullPage: true });
  await admin.setViewportSize({ width: 320, height: 1050 });
  await admin.goto(`${origin}/hr/referrals`);
  await admin.getByRole('main').getByRole('heading', { name: '员工内推管理', exact: true }).waitFor();
  await admin.getByLabel('候选人姓名', { exact: true }).fill(`${marker}_ui`);
  await admin.getByRole('button', { name: '查询', exact: true }).click();
  await admin.getByRole('article').filter({ has: admin.getByRole('heading', { name: `${marker}_ui`, exact: true }) })
    .getByRole('button', { name: '查看推荐', exact: true }).click();
  const mobileManagement = admin.getByRole('dialog', { name: '推荐办理', exact: true });
  await mobileManagement.getByText('初筛通过', { exact: true }).waitFor();
  check('手机直接打开人事推荐入口并重读原初筛结果', await mobileManagement.getByRole('button', { name: '转入招聘', exact: true }).isVisible()
    && await admin.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await admin.screenshot({ path: path.join(directory, `h2-referral-management-mobile-${marker}.png`), fullPage: true });
}
