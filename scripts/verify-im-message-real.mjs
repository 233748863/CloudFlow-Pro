import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyImMessageDisabled(context, employee) {
  const { admin, api, successful, database, check, directory, caseTag } = context;
  const entry = '/auth/system/message/channel';
  const code = `im_message_${caseTag.replaceAll('-', '_')}`;
  assert.match(code, /^[A-Za-z0-9_]{1,50}$/);
  const name = `企业微信通知验证 ${caseTag}`;
  let channelId;
  try {
    successful(await api(admin, entry, { method: 'POST', body: {
      channelType: 'WECOM', channelCode: code, channelName: name, priority: 0,
      retryCount: 1, retryIntervalSec: 60, status: 'ENABLED',
    } }), '创建隔离企业微信消息渠道');
    const channels = successful(await api(admin, `${entry}/list?channelType=WECOM&pageSize=100`), '读取企业微信消息渠道');
    const channel = channels.rows.find(row => row.channelCode === code);
    assert.ok(channel && Number.isSafeInteger(channel.channelId));
    channelId = channel.channelId;
    check('企业微信消息适配器实际注册为已实现', channel.implementedFlag === 1);
    check('消息渠道复用企业通信凭据而未保存第二份密钥', database(`SELECT COUNT(*) FROM sys_message_channel WHERE channel_id=${channelId} AND api_secret_cipher IS NULL AND endpoint IS NULL;`) === '1');
    const test = successful(await api(admin, `${entry}/${channelId}/test`, { method: 'POST', body: {} }), '验证停用环境企业微信消息');
    check('接入未配置时测试明确不可用且不报成功', test.success === false && test.message.includes('企业微信消息不可用'));
    check('普通员工不能测试企业微信消息渠道', (await api(employee, `${entry}/${channelId}/test`, { method: 'POST', body: {} })).status === 403);
    for (const width of [1440, 320]) {
      await admin.setViewportSize({ width, height: 1100 });
      await admin.goto(new URL('/message/channel', admin.url()).href, { waitUntil: 'domcontentloaded' });
      await admin.getByRole('heading', { name: '消息渠道', exact: true, level: 2 }).waitFor();
      const row = admin.getByRole('row').filter({ hasText: name });
      await row.getByRole('button', { name: '编辑渠道', exact: true }).click();
      await admin.getByText('企业微信沿用当前租户的“企业通信配置”', { exact: false }).waitFor();
      const editor = admin.getByRole('dialog');
      check(`${width}px企业微信渠道编辑不要求重复填写服务地址或密钥`, await editor.locator('input[type=password], input[type=url]').count() === 0
        && !((await editor.innerText()).includes('接口账号')));
      check(`${width}px企业微信渠道编辑无页面横向溢出`, await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const save = await editor.getByRole('button', { name: '保存配置', exact: true }).boundingBox();
      check(`${width}px保存配置位于可视范围且手机触控高度至少44像素`, save && save.y >= 0 && save.y + save.height <= 1100 && (width > 639 || save.height >= 44));
      await admin.screenshot({ path: path.join(directory, `g4-im-message-channel-${width}-${caseTag}.png`), fullPage: false });
      await editor.getByRole('button', { name: '取消', exact: true }).click();
      await row.getByRole('button', { name: '发送测试', exact: true }).click();
      const dialog = admin.getByRole('dialog');
      check(`${width}px企业微信测试说明不发送业务消息且无接收地址输入`, (await dialog.innerText()).includes('不发送业务消息') && await dialog.locator('input').count() === 0);
      await dialog.getByRole('button', { name: '开始测试', exact: true }).click();
      await dialog.getByText('企业微信消息不可用', { exact: false }).waitFor();
      check(`${width}px企业微信测试真实显示未启用`, (await dialog.innerText()).includes('测试未通过'));
      const start = await dialog.getByRole('button', { name: '开始测试', exact: true }).boundingBox();
      check(`${width}px开始测试位于可视范围且手机触控高度至少44像素`, start && start.y >= 0 && start.y + start.height <= 1100 && (width > 639 || start.height >= 44));
      await admin.screenshot({ path: path.join(directory, `g4-im-message-disabled-${width}-${caseTag}.png`), fullPage: false });
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      for (const [route, title] of [['template', '消息模板'], ['record', '发送记录']]) {
        await admin.goto(new URL(`/message/${route}`, admin.url()).href, { waitUntil: 'domcontentloaded' });
        await admin.getByRole('heading', { name: title, exact: true, level: 2 }).waitFor();
        check(`${width}px${title}真实入口正常且无横向溢出`, await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }
    const templates = successful(await api(admin, '/auth/system/message/template/list?channelType=WECOM&pageSize=100'), '读取预置企业微信消息模板');
    check('本租户可读取两种正式企业微信预置模板', ['IM_NOTICE_TEXT', 'IM_NOTICE_DETAIL'].every(templateCode => templates.rows.some(template => template.templateCode === templateCode)));
    check('连通性测试未生成或发送业务通知', database(`SELECT COUNT(*) FROM sys_message_record WHERE channel_id=${channelId};`) === '0');
    console.log('G4_IM_MESSAGE_DISABLED_REAL: registered=true; unavailable_explicit=true; repeated_credentials=false; desktop_mobile=true; real_http=true; api_doubles=0; vendor_service=false; business_messages_sent=0');
  } catch (failure) {
    await admin.screenshot({ path: path.join(directory, `g4-im-message-failure-${caseTag}.png`), fullPage: true, timeout: 5000 }).catch(() => {});
    console.log(`G4_IM_MESSAGE_FAILURE: path=${new URL(admin.url()).pathname}; width=${admin.viewportSize()?.width}`);
    throw failure;
  } finally {
    if (!channelId) {
      const value = database(`SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code='${code}' AND deleted=0;`);
      if (value) { assert.match(value, /^\d+$/); channelId = Number(value); }
    }
    if (channelId) {
      successful(await api(admin, `${entry}/${channelId}`, { method: 'DELETE' }), '删除本轮消息渠道');
      check('仅清理本轮企业微信测试渠道', database(`SELECT COUNT(*) FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=${channelId} AND deleted=0;`) === '0');
    }
  }
}
