import { verifyOauthClientInterface } from './client-interface.mjs';
import { verifyOauthAuthorizationInterface } from './authorization-interface.mjs';
import { inspectOauthPage } from './interface-tools.mjs';
import path from 'node:path';

export async function verifyOauth2Interface(context) {
  const { admin, origin, check, evidence, disabledOnly } = context;
  for (const frame of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    if (disabledOnly) {
      await admin.setViewportSize({ width: frame.width, height: frame.height });
      await admin.goto(`${origin}/oauth2/authorize?response_type=code`, { waitUntil: 'domcontentloaded' });
      const alert = admin.getByRole('alert');
      await alert.waitFor({ state: 'visible' });
      const message = await alert.innerText();
      console.log(`H5_OAUTH2_DISABLED_MESSAGE: frame=${frame.name}; path=${new URL(admin.url()).pathname}; message=${JSON.stringify(message)}`);
      await admin.screenshot({ path: path.join(context.directory, `h5-oauth2-${context.caseTag}-${frame.name}-disabled-message.png`), fullPage: true,
        mask: [admin.getByLabel('本次客户端密钥', { exact: true }), admin.getByLabel('当前账号密码', { exact: true })] });
      check(`${frame.name}未配置授权入口有明确停用提示`, message.includes('停用'));
      await inspectOauthPage(context, admin, `${frame.name}-disabled`);
      evidence[frame.name] = true;
    } else {
      try {
        const client = await verifyOauthClientInterface(context, frame);
        await verifyOauthAuthorizationInterface(context, frame, client);
      } catch (failure) {
        for (const [name, page] of [['admin', admin], ['employee', context.employee]]) {
          console.log(`H5_OAUTH2_UI_FAILURE: page=${name}; path=${new URL(page.url()).pathname}; alerts=${JSON.stringify(await page.getByRole('alert').allTextContents())}; dialogs=${await page.getByRole('dialog').count()}`);
          await page.screenshot({ path: path.join(context.directory, `h5-oauth2-${context.caseTag}-${frame.name}-${name}-failure.png`), fullPage: true,
            mask: [page.getByLabel('本次客户端密钥', { exact: true }), page.getByLabel('当前账号密码', { exact: true })] });
        }
        throw failure;
      }
    }
  }
}
