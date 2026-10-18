import path from 'node:path';

export async function verifyMeetingInterface({ admin, employee, outsider, api, successful, check, database, quote, date, dayAfter, room, changed, occurred, caseTag, directory }) {
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const layout = async (page, dialog, width, label, buttonName) => {
    await page.setViewportSize({ width, height: 1000 });
    const button = dialog.getByRole('button', { name: buttonName, exact: true }); await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    check(`${label} ${width}px页面无横向溢出且操作按钮至少44px；页面=${dimensions.content}/${dimensions.viewport}；按钮=${bounds?.width}x${bounds?.height}`,
      dimensions.content <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
    await page.screenshot({ path: path.join(directory, `h4-${label}-${caseTag}-${width}.png`), fullPage: true });
  };
  await navigate(admin, '/admin/meeting-board');
  await admin.getByRole('heading', { name: '会议室资源看板', exact: true }).waitFor();
  await field(admin, '看板日期').fill(date);
  await field(admin, '看板设备条件').fill(caseTag);
  const boardResponse = admin.waitForResponse(response => response.url().includes('/oa/meeting/board?') && response.url().includes(caseTag));
  await admin.getByRole('button', { name: '查询房间', exact: true }).click();
  check('资源看板实际查询服务器按设备及日期过滤', (await boardResponse).status() === 200);
  for (const width of [1440, 375, 320]) {
    await admin.setViewportSize({ width, height: 1000 });
    const lane = width >= 900 ? admin.getByRole('row').filter({ has: admin.getByText(room.name, { exact: true }) })
      : admin.locator('.meeting-room-card').filter({ has: admin.getByRole('heading', { name: room.name, exact: true }) });
    await layout(admin, lane, width, 'board', '预约规则');
    const meeting = width >= 900 ? lane.getByText(changed.title, { exact: true }) : lane.getByRole('button').filter({ hasText: changed.title });
    await meeting.scrollIntoViewIfNeeded();
    check(`资源看板${width}px显示实际已预约标题`, await meeting.isVisible());
  }
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.getByRole('heading', { name: '会议室资源看板', exact: true }).waitFor();
  await field(admin, '看板日期').fill(date); await field(admin, '看板设备条件').fill(caseTag);
  const refreshedBoard = admin.waitForResponse(response => response.url().includes('/oa/meeting/board?') && response.url().includes(caseTag));
  await admin.getByRole('button', { name: '查询房间', exact: true }).click();
  check('手机刷新后重新查询真实房间与占用记录', (await refreshedBoard).status() === 200);
  const mobileEntry = admin.locator('.meeting-room-card').filter({ has: admin.getByRole('heading', { name: room.name, exact: true }) });
  await mobileEntry.getByRole('button').filter({ hasText: changed.title }).waitFor();
  await layout(admin, mobileEntry, 320, 'board-mobile-entry', '预约规则');
  check('手机首次路由加载与刷新后仍可操作真实资源看板', await mobileEntry.getByRole('button').filter({ hasText: changed.title }).isVisible());
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await navigate(admin, '/admin/meeting-board');
  await admin.getByRole('heading', { name: '会议室资源看板', exact: true }).waitFor();
  await field(admin, '看板日期').fill(date); await field(admin, '看板设备条件').fill(caseTag);
  await admin.getByRole('button', { name: '查询房间', exact: true }).click();
  const lane = admin.getByRole('row').filter({ has: admin.getByText(room.name, { exact: true }) });
  await lane.getByText(changed.title, { exact: true }).waitFor();
  await lane.getByRole('button', { name: '预约规则', exact: true }).click();
  const rules = admin.getByRole('dialog', { name: `预约规则 · ${room.name}`, exact: true });
  await field(rules, '会后间隔分钟').fill('20');
  const inspectedRule = admin.waitForResponse(response => response.url().endsWith(`/oa/meeting-room/${room.roomId}/booking-rule/preview`) && response.request().method() === 'POST');
  await rules.getByRole('button', { name: '预览存量影响', exact: true }).click();
  const inspectedResult = await (await inspectedRule).json();
  const consent = rules.getByRole('checkbox', { name: '已核对存量影响，仅对后续预约应用新规则', exact: true }); await consent.waitFor();
  await rules.getByRole('button', { name: '确认保存规则', exact: true }).click();
  check('实际规则页面未确认已有预约影响前阻止保存', await rules.getByRole('alert').getByText('请查看并确认已有预约影响清单', { exact: true }).isVisible()
    && database(`SELECT buffer_minutes FROM oa_meeting_room WHERE room_id=${room.roomId};`) === '10');
  await layout(admin, rules, 375, 'rules', '确认保存规则');
  await consent.check();
  const savedRule = admin.waitForResponse(response => response.url().endsWith(`/oa/meeting-room/${room.roomId}/booking-rule`) && response.request().method() === 'PUT');
  await rules.getByRole('button', { name: '确认保存规则', exact: true }).click();
  const ruleResult = await savedRule;
  const ruleBody = await ruleResult.json(); const sentRule = ruleResult.request().postDataJSON();
  check('规则页面实际提交明确确认及对应预览摘要', sentRule.confirmExistingConflicts === true && /^[a-f0-9]{64}$/.test(sentRule.impactDigest)
    && sentRule.impactDigest === inspectedResult.data.impactDigest);
  if (ruleResult.status() !== 200 || ruleBody.code !== 200) {
    const latest = await api(admin, `/oa/meeting-room/${room.roomId}/booking-rule/preview`, { method: 'POST', body: sentRule });
    console.log(`H4_RULE_CONFIRMATION_DIAGNOSTIC: ${JSON.stringify({ status: ruleResult.status(), message: ruleBody.msg,
      digestUnchanged: inspectedResult.data.impactDigest === latest.body?.data?.impactDigest,
      originalAffected: inspectedResult.data.affected, currentAffected: latest.body?.data?.affected })}`);
  }
  check('真实页面确认后保存新规则，已有预约保留原10分钟快照', ruleResult.status() === 200 && ruleBody.code === 200
    && database(`SELECT buffer_minutes FROM oa_meeting_room WHERE room_id=${room.roomId};`) === '20'
    && database(`SELECT buffer_minutes_snapshot FROM oa_schedule_event WHERE event_id=${changed.eventId};`) === '10');
  await rules.waitFor({ state: 'hidden' });
  const mobileLane = admin.locator('.meeting-room-card').filter({ has: admin.getByRole('heading', { name: room.name, exact: true }) });
  await mobileLane.getByRole('button', { name: '照片', exact: true }).click();
  const photo = admin.getByRole('dialog', { name: room.name, exact: true }); const image = photo.getByRole('img', { name: '会议室实际照片' }); await image.waitFor();
  check('手机页面渲染从真实私有存储读取的照片', await image.evaluate(element => element.complete && element.naturalWidth > 0));
  await layout(admin, photo, 375, 'photo', '关闭弹窗');
  await photo.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await navigate(employee, `/office/my-meetings?eventId=${changed.eventId}`);
  const own = employee.getByRole('dialog', { name: changed.title, exact: true }); await own.waitFor();
  for (const width of [1440, 375, 320]) await layout(employee, own, width, 'detail', '编辑本次会议');
  check('本人详情保留邀请回应，并提供本人编辑入口', await own.getByRole('button', { name: '接受', exact: true }).isVisible());
  await navigate(outsider, `/office/my-meetings?eventId=${changed.eventId}`);
  await outsider.getByRole('alert').filter({ hasText: /会议不存在|无权访问/ }).waitFor();
  check('无关系用户实际页面隐藏受限会议内容和编辑入口', await outsider.getByRole('button', { name: '编辑本次会议', exact: true }).count() === 0
    && await outsider.getByText(changed.title, { exact: true }).count() === 0);
  await employee.setViewportSize({ width: 375, height: 1000 }); await navigate(employee, '/office/my-meetings');
  await employee.getByRole('button', { name: '新建预约', exact: true }).click();
  const editor = employee.getByRole('dialog', { name: '新建会议预约', exact: true }); const title = `H4_UI_${caseTag}`;
  await editor.getByRole('button', { name: '每日，共5次', exact: true }).click();
  await field(editor, '周期截止日期').fill(dayAfter(8));
  await editor.getByRole('button', { name: '单次', exact: true }).click();
  await field(editor, '会议标题').fill(title);
  await field(editor, '会议开始时间').fill(`${date}T13:00`);
  await field(editor, '会议结束时间').fill(`${date}T14:00`);
  await editor.getByRole('button', { name: '查询可预约房间', exact: true }).click();
  const picker = employee.getByRole('dialog', { name: '选择可预约会议室', exact: true });
  await layout(employee, picker, 320, 'room-picker', '关闭弹窗');
  await picker.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await editor.getByRole('button', { name: '核查参与者时间', exact: true }).click();
  const conflict = editor.getByRole('checkbox', { name: '我已查看提示，仍继续预约（会议室冲突必须解决）', exact: true }); await conflict.waitFor();
  await editor.getByRole('button', { name: '确认预约', exact: true }).click();
  check('手机预约确实显示本人冲突，未确认时不保存', await editor.getByRole('alert').getByText('请查看并明确确认参与者冲突提示', { exact: true }).isVisible()
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE title=${quote(title)} AND tenant_id=100000;`) === '0');
  await conflict.check();
  await layout(employee, editor, 320, 'booking', '确认预约');
  const booked = employee.waitForResponse(response => response.url().endsWith('/oa/meeting/booking') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: '确认预约', exact: true }).click(); const bookingResponse = await booked; const bookingResult = await bookingResponse.json();
  const bookingCommand = bookingResponse.request().postDataJSON();
  check('切回单次会议时实际请求不携带空周期规则或遗留截止日期', !Object.hasOwn(bookingCommand, 'recurrenceRule') && !Object.hasOwn(bookingCommand, 'recurrenceEndDate'));
  check('手机通过真实预约接口保存本人会议', bookingResponse.status() === 200 && bookingResult.code === 200 && String(bookingResult.data.creatorId) === '990000707'
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE title=${quote(title)} AND tenant_id=100000;`) === '1');
  await employee.getByRole('dialog', { name: title, exact: true }).waitFor();
  await navigate(employee, '/office/my-meetings'); await employee.getByRole('button', { name: '新建预约', exact: true }).click();
  const seriesEditor = employee.getByRole('dialog', { name: '新建会议预约', exact: true }); const seriesTitle = `H4_UI_SERIES_${caseTag}`;
  await field(seriesEditor, '会议标题').fill(seriesTitle);
  await field(seriesEditor, '会议开始时间').fill(`${dayAfter(6)}T11:00`);
  await field(seriesEditor, '会议结束时间').fill(`${dayAfter(6)}T12:00`);
  await seriesEditor.getByRole('button', { name: '每日，共5次', exact: true }).click();
  await field(seriesEditor, '周期规则').fill('FREQ=DAILY;COUNT=2');
  await seriesEditor.getByRole('button', { name: '预览全部周期实例', exact: true }).click();
  await seriesEditor.getByRole('heading', { name: '全部实例影响清单 · 2项', exact: true }).waitFor();
  const seriesConflicts = seriesEditor.getByRole('checkbox', { name: '我已查看提示，仍继续预约（会议室冲突必须解决）', exact: true });
  if (await seriesConflicts.isVisible()) await seriesConflicts.check();
  const seriesConsent = seriesEditor.getByRole('checkbox', { name: '已确认本次全部实例影响清单，保留已发生、独立改期和已取消的实例', exact: true });
  await seriesConsent.check();
  const seriesSaved = employee.waitForResponse(response => response.url().endsWith('/oa/meeting/series') && response.request().method() === 'POST');
  await seriesEditor.getByRole('button', { name: '确认预约', exact: true }).click(); const seriesResult = await seriesSaved;
  check('手机真实周期预览与确认后保存两份实际会议', seriesResult.status() === 200 && (await seriesResult.json()).data.instances.length === 2
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE title=${quote(seriesTitle)} AND recurrence_role='INSTANCE' AND tenant_id=100000;`) === '2');
  await navigate(employee, '/admin/meeting-usage');
  await employee.getByRole('heading', { name: '权限不足', exact: true }).waitFor();
  check('员工直接打开手机管理使用率入口仍被页面权限守卫拒绝', await employee.getByRole('heading', { name: '权限不足', exact: true }).isVisible());
  await admin.setViewportSize({ width: 1440, height: 1000 });
  const oldPath = database("SELECT path FROM sys_menu WHERE component='pages/MeetingRoomPage' AND menu_type='C' LIMIT 1;");
  check('原会议室管理页面仍保留真实菜单入口', oldPath.startsWith('/'));
  await navigate(admin, oldPath); await admin.getByRole('button', { name: '管理模式', exact: true }).click();
  await admin.getByRole('button', { name: '新增会议室', exact: true }).click();
  const roomEditor = admin.getByRole('dialog', { name: '新增会议室', exact: true }); const roomName = `H4_UI_ROOM_${caseTag}`;
  await roomEditor.getByPlaceholder('例如：大会议室A', { exact: true }).fill(roomName);
  await roomEditor.getByPlaceholder('例如：3楼东侧', { exact: true }).fill('隔离UI验收区');
  check('原新建会议室入口必须显式确认完整预约规则', await roomEditor.getByRole('button', { name: '确认新增', exact: true }).isDisabled());
  await field(roomEditor, '会议室开放时间').fill('08:00');
  await field(roomEditor, '会议室关闭时间').fill('19:00');
  await field(roomEditor, '会后间隔分钟').fill('15');
  await roomEditor.getByRole('checkbox', { name: '已核对开放时段、时长、审批及会后间隔规则', exact: true }).check();
  await layout(admin, roomEditor, 375, 'new-room', '确认新增');
  const roomSaved = admin.waitForResponse(response => response.url().endsWith('/oa/meeting-room') && response.request().method() === 'POST');
  await roomEditor.getByRole('button', { name: '确认新增', exact: true }).click(); const roomResult = await roomSaved;
  check('原页面真实新建同时保存可见填写的预约规则', roomResult.status() === 200 && (await roomResult.json()).code === 200
    && database(`SELECT CONCAT(open_time,',',close_time,',',buffer_minutes) FROM oa_meeting_room WHERE name=${quote(roomName)} AND tenant_id=100000;`) === '08:00:00,19:00:00,15');
  await navigate(admin, `/office/meeting-minutes?eventId=${occurred.eventId}`);
  const minutes = admin.getByRole('dialog', { name: '新建会议纪要', exact: true }); await minutes.waitFor();
  check('从会议进入纪要页面自动关联实际会议', await minutes.getByText('已关联本次实际会议，纪要直接复用原邀请和签到记录；保存纪要不会新增会议室预约。', { exact: true }).isVisible());
  await minutes.locator('textarea').first().fill(`H4真实会议纪要 ${caseTag}`);
  await layout(admin, minutes, 375, 'minutes', '保存');
  const minutesSaved = admin.waitForResponse(response => response.url().endsWith('/oa/meeting/minutes') && response.request().method() === 'POST');
  await minutes.getByRole('button', { name: '保存', exact: true }).click(); const minutesResult = await minutesSaved;
  check('手机真实保存纪要成功且没有新增预约副作用', minutesResult.status() === 200 && (await minutesResult.json()).code === 200
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE event_id=${occurred.eventId} AND tenant_id=100000;`) === '1');
  let actualUsage;
  for (let pageNum = 1; !actualUsage; pageNum++) {
    const usage = successful(await api(admin, `/oa/meeting/usage?${new URLSearchParams({ start: `${date} 00:00:00`, end: `${dayAfter(3)} 00:00:00`, pageNum: String(pageNum), pageSize: '50' })}`), '真实使用率查询');
    actualUsage = usage.rows.find(value => String(value.room.roomId) === String(room.roomId));
    if (pageNum * 50 >= usage.total) break;
  }
  check('当前未实际使用的未来会议不计入实际使用率', actualUsage?.usedMinutes === 0);
}
