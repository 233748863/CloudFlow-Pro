import path from 'node:path';

export async function inspectOauthPage(context, page, label) {
  const { check, directory, caseTag } = context;
  const measurements = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.oauth2-workspace, .oauth2-dialog')].filter(element => element.getClientRects().length);
    const controls = roots.flatMap(root => [...root.querySelectorAll('button, [role="combobox"], input:not([type="checkbox"]), textarea, a, label:has(input[type="checkbox"])')])
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
      targets: controls.length, shortTargets: controls.filter(element => element.getBoundingClientRect().height < 43.5).length };
  });
  check(`${label}页面没有横向溢出`, !measurements.overflow);
  check(`${label}可见操作目标至少44px`, measurements.targets > 0 && measurements.shortTargets === 0);
  await page.screenshot({ path: path.join(directory, `h5-oauth2-${caseTag}-${label}.png`), fullPage: true,
    mask: [page.getByLabel('本次客户端密钥', { exact: true }), page.getByLabel('当前账号密码', { exact: true })] });
}

export async function secretsStayTransient(context, page, values, label) {
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  context.check(`${label}凭据未写入浏览器持久存储或Cookie`, values.filter(Boolean).every(value => !persisted.includes(value)));
}

export async function holdOauthResponse(page, requestPath, method, receive, lose = false) {
  let resolveArrival;
  let rejectArrival;
  let release;
  let count = 0;
  const arrival = new Promise((resolve, reject) => { resolveArrival = resolve; rejectArrival = reject; });
  const released = new Promise(resolve => { release = resolve; });
  const pattern = `**/api${requestPath}`;
  const handler = async route => {
    if (route.request().method() !== method) return route.fallback();
    count++;
    try {
      const response = await route.fetch();
      const body = await response.json();
      await receive({ status: response.status(), body, request: route.request().postDataJSON() });
      resolveArrival();
      await released;
      if (lose) await route.abort('failed'); else await route.fulfill({ response });
    } catch (failure) { rejectArrival(failure); await route.abort('failed').catch(() => {}); }
  };
  await page.route(pattern, handler);
  return { arrived: async () => {
    let timer;
    try { return await Promise.race([arrival, new Promise((unused, reject) => { timer = setTimeout(() => reject(new Error('真实OAuth响应等待超时')), 25000); })]); }
    finally { clearTimeout(timer); }
  },
    count: () => count, release, close: async () => { release(); await page.unroute(pattern, handler); } };
}

export async function oauthUiResponse(page, requestPath, method, action) {
  const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === `/api${requestPath}` && candidate.request().method() === method);
  await action();
  const result = await response;
  return { status: result.status(), body: await result.json() };
}
