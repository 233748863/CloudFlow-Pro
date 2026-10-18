import assert from 'node:assert/strict';

export async function authenticateE5MarketingAccount(page, credentials, origin = 'http://127.0.0.1:3000') {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/);
  assert.equal(new URL(page.url()).origin, origin);
  assert.ok(process.argv[1]?.endsWith('verify-e5-marketing.mjs') && ['g_import_admin', 'g_import_other', 'g_import_readonly', 'g_opportunity_sales', 'g_opportunity_manager', 'g_import_tenant', 'g_holiday_employee', 'g_holiday_hr'].includes(credentials.username), 'Explicit independent E5 fixture account required');
  return page.evaluate(async supplied => {
    const auth = await import('/src/services/api/auth.ts');
    const storage = await import('/src/utils/authStorage.ts');
    const challenge = await auth.getCaptcha();
    const pixels = async source => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const drawing = canvas.getContext('2d'); drawing.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: drawing.getImageData(0, 0, image.width, image.height).data };
    };
    const background = await pixels(challenge.bgImage);
    const slider = await pixels(challenge.sliderImage);
    const alpha = (horizontal, vertical) => slider.data[(vertical * slider.width + horizontal) * 4 + 3];
    const edges = [];
    for (let vertical = 4; vertical < slider.height - 4; vertical += 2) {
      for (let horizontal = 4; horizontal < slider.width - 4; horizontal += 2) {
        if (alpha(horizontal, vertical) < 240) continue;
        for (const [shiftX, shiftY] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          if (alpha(horizontal + shiftX, vertical + shiftY) < 30) edges.push([horizontal, vertical, horizontal + shiftX, vertical + shiftY]);
        }
      }
    }
    if (edges.length < 5) return { authenticated: false, reason: 'CAPTCHA_EDGES_MISSING' };
    const luminance = (horizontal, vertical) => {
      const offset = (vertical * background.width + horizontal) * 4;
      return background.data[offset] * 0.2126 + background.data[offset + 1] * 0.7152 + background.data[offset + 2] * 0.0722;
    };
    let best = { position: 0, score: -Infinity };
    for (let position = slider.width; position < background.width - slider.width; position++) {
      const score = edges.reduce((total, edge) => total + luminance(position + edge[0], challenge.y + edge[1]) - luminance(position + edge[2], challenge.y + edge[3]), 0);
      if (score > best.score) best = { position, score };
    }
    const passed = await auth.checkCaptcha({ uuid: challenge.uuid, x: best.position });
    const release = await auth.getActiveLegalRelease(supplied.tenantCode);
    const response = await auth.login(supplied.tenantCode, supplied.username, supplied.password, passed.passToken, release.releaseCode);
    if (response.requiresTotp || !response.token || response.forcePasswordChange) return { authenticated: false, reason: 'AUTHENTICATION_NOT_COMPLETED' };
    storage.setAuthToken(response.token);
    const identity = await auth.getInfo({ silent: true });
    return { authenticated: true, userId: String(identity.userId), tenantId: String(identity.tenantId), permissions: identity.permissions || [] };
  }, credentials);
}
