const fs = require('fs');
const path = require('path');
const { chromium } = require('./ui-regression/node_modules/playwright');

const ROOT = __dirname;
const TOKENS_PATH = path.join(ROOT, 'ui_session_tokens.json');
const RESULT_PATH = path.join(ROOT, 'oa_ui_regression_result.json');
const SCREENSHOT_DIR = path.join(ROOT, 'logs', 'oa-ui');
const UI_BASE_URL = 'http://127.0.0.1:3000';
const API_HOST_MARKERS = ['127.0.0.1:9000', '127.0.0.1:9001', '127.0.0.1:9002', '127.0.0.1:9003'];
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const PAGE_GROUPS = [
  {
    user: null,
    pages: [
      { name: '\u767b\u5f55\u9875', path: '/login' },
      { name: '\u9996\u9875\u8df3\u8f6c', path: '/' },
    ],
  },
  {
    user: 'admin',
    pages: [
      { name: '\u5de5\u4f5c\u53f0', path: '/workplace' },
      { name: '\u5f85\u529e\u4efb\u52a1', path: '/tasks' },
      { name: '\u6211\u7684\u7533\u8bf7', path: '/my-apps' },
      { name: '\u516c\u544a\u4e2d\u5fc3', path: '/announcement' },
      { name: 'OA \u516c\u544a', path: '/office/announcement' },
      { name: '\u901a\u8baf\u5f55', path: '/office/contact' },
      { name: '\u65e5\u7a0b\u7ba1\u7406', path: '/schedule' },
      { name: '\u4f1a\u8bae\u5ba4', path: '/meeting-room' },
      { name: '\u8003\u52e4\u6253\u5361', path: '/admin/attendance/checkin' },
      { name: '\u8003\u52e4\u89c4\u5219', path: '/admin/attendance/rule' },
      { name: '\u8d44\u4ea7\u7ba1\u7406', path: '/admin/asset' },
      { name: '\u8f66\u8f86\u7ba1\u7406', path: '/admin/vehicle/list' },
      { name: '\u7528\u8f66\u7533\u8bf7', path: '/admin/vehicle/booking' },
      { name: '\u8f66\u8f86\u4f7f\u7528', path: '/admin/vehicle/usage' },
      { name: '\u8bbf\u5ba2\u7ba1\u7406', path: '/admin/visitor' },
      { name: '\u503c\u73ed\u6392\u73ed', path: '/admin/duty-schedule' },
      { name: '\u62a5\u9500\u7533\u8bf7', path: '/expense/claim' },
      { name: '\u4ed8\u6b3e\u7533\u8bf7', path: '/payment/request' },
    ],
  },
  {
    user: 'zhang',
    pages: [
      { name: '\u5458\u5de5\u5de5\u4f5c\u53f0', path: '/workplace' },
      { name: '\u6211\u7684\u7533\u8bf7\u5217\u8868', path: '/my-apps' },
      { name: '\u52a0\u73ed\u7533\u8bf7', path: '/office/overtime' },
      { name: '\u51fa\u5dee\u7533\u8bf7', path: '/office/business-trip' },
      { name: '\u8865\u5361\u7533\u8bf7', path: '/office/attendance-appeal' },
      { name: '\u5458\u5de5\u901a\u8baf\u5f55', path: '/office/contact' },
      { name: '\u4f1a\u8bae\u5ba4\u9884\u7ea6', path: '/meeting-room' },
    ],
  },
];

function loadTokenMap() {
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

function buildUserStub(username, tokenInfo) {
  return {
    id: String(tokenInfo.userId),
    name: tokenInfo.nickName || tokenInfo.userName,
    username: tokenInfo.userName,
    email: '',
    role: tokenInfo.role,
    deptId: tokenInfo.deptId || (username === 'admin' ? 100 : 101),
    deptName: tokenInfo.deptName || (username === 'admin' ? 'CloudFlow \u79d1\u6280' : '\u7814\u53d1\u90e8'),
    tenantId: tokenInfo.tenantId || 100000,
    position: '',
    phone: tokenInfo.phone || '',
    status: 'ACTIVE',
    avatar: tokenInfo.avatar || '',
  };
}

function shouldTrackApi(url) {
  if (API_HOST_MARKERS.some((marker) => url.includes(marker))) {
    return true;
  }
  return url.startsWith('http://127.0.0.1:3000/auth/') || url.startsWith('http://127.0.0.1:3000/oa/') || url.startsWith('http://127.0.0.1:3000/workflow/');
}

function normalizeApiPath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch (_error) {
    return url;
  }
}

function isExpectedWarning(pageConfig, groupUser, apiErrors, consoleErrors) {
  const normalizedPaths = apiErrors.map((item) => normalizeApiPath(item.url));
  if (groupUser === 'zhang' && (pageConfig.path === '/workplace' || pageConfig.path === '/my-apps')) {
    const knownConsoleOnly = consoleErrors.length > 0 && consoleErrors.every((message) => message.includes('403 (Forbidden)') || message.includes('Failed to fetch form definitions'));
    const onlyWorkflowForms403 = apiErrors.length === 0 || apiErrors.every((item) => item.status === 403 && normalizeApiPath(item.url) === '/workflow/forms');
    return knownConsoleOnly && onlyWorkflowForms403;
  }
  return false;
}

function sanitizeFileName(input) {
  return input.replace(/[\\/:*?"<>|]+/g, '_');
}

async function createContext(browser, tokens, username) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  if (!username) {
    return context;
  }

  const tokenInfo = tokens.users[username];
  if (!tokenInfo || !tokenInfo.token) {
    throw new Error(`\u672a\u627e\u5230 ${username} \u7684\u767b\u5f55 token`);
  }

  const userStub = buildUserStub(username, tokenInfo);
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', JSON.stringify(user));
  }, { token: tokenInfo.token, user: userStub });
  return context;
}

async function inspectPage(context, groupUser, pageConfig) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const apiErrors = [];
  const requestFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (!shouldTrackApi(url)) {
      return;
    }
    const status = response.status();
    if (status < 400) {
      return;
    }
    let body = '';
    try {
      body = await response.text();
    } catch (error) {
      body = `<\u8bfb\u53d6\u54cd\u5e94\u5931\u8d25: ${String(error)}>`;
    }
    apiErrors.push({ url, status, body: body.slice(0, 400) });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!shouldTrackApi(url)) {
      return;
    }
    requestFailures.push({
      url,
      method: request.method(),
      errorText: request.failure() ? request.failure().errorText : 'unknown',
    });
  });

  const targetUrl = `${UI_BASE_URL}${pageConfig.path}`;
  let currentUrl = '';
  let title = '';
  let bodySnippet = '';

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    currentUrl = page.url();
    title = await page.title();
    bodySnippet = (await page.locator('body').innerText()).trim().slice(0, 200);

    const redirectedToLogin = pageConfig.path !== '/login' && pageConfig.path !== '/' && currentUrl.includes('/login');
    const expectedWarning = isExpectedWarning(pageConfig, groupUser, apiErrors, consoleErrors);
    const filteredConsoleErrors = expectedWarning ? [] : consoleErrors;
    const filteredApiErrors = expectedWarning ? [] : apiErrors;
    const hasCriticalConsole = filteredConsoleErrors.length > 0 || pageErrors.length > 0;
    const hasCriticalApi = filteredApiErrors.length > 0 || requestFailures.length > 0;
    const passed = !redirectedToLogin && !hasCriticalConsole && !hasCriticalApi;

    const result = {
      name: pageConfig.name,
      path: pageConfig.path,
      user: groupUser || 'guest',
      status: passed ? 'passed' : 'failed',
      currentUrl,
      title,
      bodySnippet,
      consoleErrors: filteredConsoleErrors,
      pageErrors,
      apiErrors: filteredApiErrors,
      requestFailures,
      warningIgnored: expectedWarning,
    };

    if (!passed) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const shotName = `${groupUser || 'guest'}-${sanitizeFileName(pageConfig.path)}.png`;
      const shotPath = path.join(SCREENSHOT_DIR, shotName);
      await page.screenshot({ path: shotPath, fullPage: true });
      result.screenshot = shotPath;
    }

    return result;
  } catch (error) {
    const result = {
      name: pageConfig.name,
      path: pageConfig.path,
      user: groupUser || 'guest',
      status: 'failed',
      currentUrl: page.url(),
      title: '',
      bodySnippet: '',
      consoleErrors: consoleErrors,
      pageErrors,
      apiErrors: apiErrors,
      requestFailures,
      error: String(error),
    };
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const shotName = `${groupUser || 'guest'}-${sanitizeFileName(pageConfig.path)}.png`;
    const shotPath = path.join(SCREENSHOT_DIR, shotName);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    result.screenshot = shotPath;
    return result;
  } finally {
    await page.close();
  }
}

async function run() {
  const tokens = loadTokenMap();
  const browser = await chromium.launch({
    headless: true,
    executablePath: EDGE_PATH,
  });

  const startedAt = new Date().toISOString();
  const results = [];

  try {
    for (const group of PAGE_GROUPS) {
      const context = await createContext(browser, tokens, group.user);
      try {
        for (const pageConfig of group.pages) {
          const result = await inspectPage(context, group.user, pageConfig);
          results.push(result);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.length - passed;
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    uiBaseUrl: UI_BASE_URL,
    passed,
    failed,
    total: results.length,
    results,
  };

  fs.writeFileSync(RESULT_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  const summary = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    uiBaseUrl: UI_BASE_URL,
    passed: 0,
    failed: 1,
    total: 1,
    results: [
      {
        name: 'UI \u56de\u5f52\u542f\u52a8\u5931\u8d25',
        status: 'failed',
        error: String(error),
      },
    ],
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.error(error);
  process.exitCode = 1;
});
