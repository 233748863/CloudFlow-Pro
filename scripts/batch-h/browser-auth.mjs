async function authorize(page) {
  const { assertRuntime, frontendUrl } = await import('./live-lib.mjs');
  assertRuntime();
  if (new URL(page.url()).origin !== frontendUrl) throw new Error('H_BROWSER_ORIGIN_MISMATCH');
}

export async function readIdentity(page) {
  await authorize(page);
  try {
    return await page.evaluate(async () => {
      try {
        const information = await (await import('/src/services/api/auth.ts')).getInfo({ silent: true });
        return {
          userId: String(information.userId ?? ''),
          tenantId: String(information.tenantId ?? ''),
          deptId: String(information.deptId ?? ''),
          userName: information.userName,
          role: information.role,
          permissions: information.permissions || [],
          forcePasswordChange: information.forcePasswordChange === true,
        };
      } catch {
        return null;
      }
    });
  } catch {
    throw new Error('H_IDENTITY_READ_FAILED');
  }
}

export async function authenticate(page, credentials) {
  await authorize(page);
  if (!/^h_20260914_[a-z0-9]+$/.test(credentials.username || '')) {
    throw new Error('H_ACCOUNT_REQUIRED');
  }
  try {
    return await page.evaluate(async supplied => {
      let stage = 'CAPTCHA';
      try {
        const auth = await import('/src/services/api/auth.ts');
        const storage = await import('/src/utils/authStorage.ts');
        const pixels = async source => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const drawing = canvas.getContext('2d');
          if (!drawing) throw new Error('CANVAS_UNAVAILABLE');
          drawing.drawImage(image, 0, 0);
          return { width: image.width, height: image.height, data: drawing.getImageData(0, 0, image.width, image.height).data };
        };
        let passToken;
        for (let attempt = 0; attempt < 3 && !passToken; attempt++) {
          try {
            const challenge = await auth.getCaptcha();
            const background = await pixels(challenge.bgImage);
            const slider = await pixels(challenge.sliderImage);
            const alpha = (horizontal, vertical) => slider.data[(vertical * slider.width + horizontal) * 4 + 3];
            const edges = [];
            for (let vertical = 4; vertical < slider.height - 4; vertical += 2) {
              for (let horizontal = 4; horizontal < slider.width - 4; horizontal += 2) {
                if (alpha(horizontal, vertical) < 240) continue;
                for (const [shiftX, shiftY] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
                  if (alpha(horizontal + shiftX, vertical + shiftY) < 30) {
                    edges.push([horizontal, vertical, horizontal + shiftX, vertical + shiftY]);
                  }
                }
              }
            }
            if (edges.length < 5) throw new Error('CAPTCHA_EDGES_MISSING');
            const luminance = (horizontal, vertical) => {
              const offset = (vertical * background.width + horizontal) * 4;
              return background.data[offset] * 0.2126 + background.data[offset + 1] * 0.7152 + background.data[offset + 2] * 0.0722;
            };
            let bestPosition = 0;
            let bestScore = -Infinity;
            for (let position = slider.width; position < background.width - slider.width; position++) {
              const score = edges.reduce((total, edge) => total
                + luminance(position + edge[0], challenge.y + edge[1])
                - luminance(position + edge[2], challenge.y + edge[3]), 0);
              if (score > bestScore) {
                bestPosition = position;
                bestScore = score;
              }
            }
            const passed = await auth.checkCaptcha({ uuid: challenge.uuid, x: bestPosition });
            passToken = passed.passToken;
          } catch {
            if (attempt === 2) return { authenticated: false, reason: 'CAPTCHA_FAILED' };
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        }
        if (!passToken) return { authenticated: false, reason: 'CAPTCHA_FAILED' };
        stage = 'LEGAL_RELEASE';
        const release = await auth.getActiveLegalRelease(supplied.tenantCode);
        if (!release.releaseCode) return { authenticated: false, reason: 'LEGAL_RELEASE_MISSING' };
        stage = 'LOGIN';
        const response = await auth.login(supplied.tenantCode, supplied.username, supplied.password, passToken, release.releaseCode);
        if (response.requiresTotp) return { authenticated: false, reason: 'TWO_FACTOR_AUTHENTICATION_REQUIRED' };
        if (!response.token) return { authenticated: false, reason: 'LOGIN_TOKEN_MISSING' };
        storage.setAuthToken(response.token);
        return response.forcePasswordChange
          ? { authenticated: false, reason: 'INITIAL_PASSWORD_CHANGE_REQUIRED' }
          : { authenticated: true };
      } catch {
        return { authenticated: false, reason: `${stage}_FAILED` };
      }
    }, { tenantCode: credentials.tenantCode, username: credentials.username, password: credentials.password });
  } catch {
    throw new Error('H_AUTHENTICATION_FAILED');
  }
}

export async function changeInitialPassword(page, credentials) {
  await authorize(page);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByText('首次登录需修改密码', { exact: true }).waitFor({ state: 'visible' });
    await page.getByLabel('当前密码', { exact: true }).fill(credentials.password);
    await page.getByLabel('新密码', { exact: true }).fill(credentials.replacement);
    await page.getByLabel('确认新密码', { exact: true }).fill(credentials.replacement);
    const responsePromise = page.waitForResponse(response => {
      const requestUrl = new URL(response.url());
      return response.request().method() === 'PUT' && requestUrl.pathname.endsWith('/auth/profile/password');
    });
    const [response] = await Promise.all([responsePromise, page.getByRole('button', { name: '更新密码', exact: true }).click()]);
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (response.status() !== 200 || result?.code !== 200) throw new Error('PASSWORD_UPDATE_REJECTED');
    await page.getByText('首次登录需修改密码', { exact: true }).waitFor({ state: 'hidden' });
  } catch {
    throw new Error('H_INITIAL_PASSWORD_CHANGE_FAILED');
  }
}
