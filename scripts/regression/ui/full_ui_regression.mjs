import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..", "..", "..");
const tokenFile = path.join(rootDir, ".codex-temp", "ui_session_tokens.json");
const outputFile = path.join(rootDir, ".codex-temp", "ui_regression_result.json");

const uiBaseUrl = process.env.CF_UI_BASE_URL || "http://127.0.0.1:3000";
const gatewayBaseUrl = process.env.CF_GATEWAY_BASE_URL || "http://127.0.0.1:9000";

function summarizeError(error) {
  if (!error) {
    return "\u672a\u77e5\u9519\u8bef";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeApiPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || "");
  }
}

function shouldIgnoreRequestFailure(entry) {
  return (
    entry?.method === "OPTIONS" &&
    normalizeApiPath(entry?.url) === "/api/auth/login" &&
    entry?.failure === "net::ERR_ABORTED"
  );
}

function buildBlockingIssueMessage(pageErrors, requestFailures, responseFailures) {
  const details = [];
  if (pageErrors.length > 0) {
    details.push(`页面异常 ${pageErrors.length} 项: ${pageErrors.join(" | ")}`);
  }
  if (requestFailures.length > 0) {
    details.push(
      `请求失败 ${requestFailures.length} 项: ${requestFailures
        .map((item) => `${item.method} ${normalizeApiPath(item.url)} ${item.failure}`)
        .join(" | ")}`,
    );
  }
  if (responseFailures.length > 0) {
    details.push(
      `接口异常 ${responseFailures.length} 项: ${responseFailures
        .map((item) => `${item.status} ${normalizeApiPath(item.url)}`)
        .join(" | ")}`,
    );
  }
  return details.join(" ; ");
}

function toRows(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data.rows)) {
      return data.rows;
    }
    if (Array.isArray(data.records)) {
      return data.records;
    }
    if (Array.isArray(data.list)) {
      return data.list;
    }
  }
  return [];
}

function mapUserInfo(info) {
  const user = info?.user || info || {};
  return {
    id: String(user.userId ?? ""),
    name: user.nickName || user.userName || "",
    username: user.userName || "",
    email: user.email || "",
    role:
      user.role ||
      (Array.isArray(info?.roles) && info.roles.length > 0
        ? String(info.roles[0]).toUpperCase()
        : "USER"),
    deptId: user.deptId,
    deptName: user.deptName || user.dept?.deptName,
    tenantId: user.tenantId,
    position: user.position,
    phone: user.phone || user.phonenumber,
    status: "ACTIVE",
    avatar: user.avatar || "",
  };
}

async function readSessions() {
  return JSON.parse(await fs.readFile(tokenFile, "utf-8"));
}

function getRuntimeSession(rawSessions, username) {
  if (rawSessions?.[username]?.token) {
    return { username, ...rawSessions[username] };
  }
  if (rawSessions?.users?.[username]?.token) {
    return { username, ...rawSessions.users[username] };
  }
  throw new Error(`\u672a\u627e\u5230 ${username} \u7684\u767b\u5f55 token`);
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`\u975e JSON \u54cd\u5e94: ${text.slice(0, 400)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  if (parsed?.code !== 200) {
    throw new Error(parsed?.msg || `\u4e1a\u52a1\u5931\u8d25: ${text.slice(0, 400)}`);
  }
  return parsed.data;
}

async function buildSession(runtimeSession) {
  const info = await fetchJson(`${gatewayBaseUrl}/auth/info`, runtimeSession.token);
  return {
    username: runtimeSession.username,
    token: runtimeSession.token,
    user: mapUserInfo(info),
  };
}

async function resolveDynamicWorkflowId(token) {
  const definitions = await fetchJson(
    `${gatewayBaseUrl}/workflow/definitions?pageNum=1&pageSize=20&params%5BlatestOnly%5D=false`,
    token,
  );
  const rows = toRows(definitions);
  if (rows.length === 0) {
    throw new Error("\u6d41\u7a0b\u5b9a\u4e49\u5217\u8868\u4e3a\u7a7a\uff0c\u65e0\u6cd5\u56de\u5f52\u7248\u672c\u5386\u53f2\u9875");
  }
  return String(rows[0].definitionId || rows[0].id || "");
}

async function createContext(browser, session) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript((payload) => {
    window.localStorage.setItem("token", payload.token);
    window.localStorage.setItem("user", JSON.stringify(payload.user));
  }, session);
  return context;
}

async function ensureLoggedIn(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => window.location.pathname !== "/login", undefined, {
    timeout: 15000,
  });
}

async function assertAnyText(page, texts) {
  let lastError;
  for (const text of texts) {
    try {
      await page.getByText(text, { exact: false }).first().waitFor({
        state: "visible",
        timeout: 6000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`\u672a\u627e\u5230\u65ad\u8a00\u6587\u672c: ${texts.join(" / ")}`);
}

async function assertWorkflowDesign(page) {
  await page.waitForTimeout(1500);
  const bodyText = (await page.textContent("body")) || "";
  const inputValues = await page
    .locator("input")
    .evaluateAll((nodes) => nodes.map((node) => node.value || ""));
  const svgCount = await page.locator("svg").count();

  const matchedByText =
    bodyText.includes("\u65b0\u6d41\u7a0b") ||
    bodyText.includes("\u6d41\u7a0bKey") ||
    bodyText.includes("\u5f00\u59cb") ||
    bodyText.includes("\u6d41\u7a0b\u7ed3\u675f") ||
    inputValues.some((value) => String(value).includes("\u65b0\u6d41\u7a0b")) ||
    inputValues.some((value) => String(value).includes("\u6d41\u7a0bKey"));

  if (matchedByText || svgCount > 0) {
    return;
  }
  throw new Error("\u6d41\u7a0b\u8bbe\u8ba1\u9875\u672a\u51fa\u73b0\u53ef\u8bc6\u522b\u7684 nodes/edges \u8bbe\u8ba1\u5185\u5bb9");
}

async function assertTemplateLibrary(page) {
  await assertAnyText(page, ["\u6a21\u677f\u5e93"]);
  await assertAnyText(page, ["\u5168\u90e8\u6a21\u677f", "\u5206\u7c7b\u5bfc\u822a"]);
  await page
    .getByPlaceholder("\u641c\u7d22\u6a21\u677f\u540d\u79f0\u3001\u63cf\u8ff0\u6216\u5206\u7c7b...")
    .waitFor({ state: "visible", timeout: 8000 });
  await assertAnyText(page, ["\u5f53\u524d\u7ed3\u679c"]);
  await assertAnyText(page, ["\u5df2\u751f\u6548\u7b5b\u9009", "\u7b5b\u9009\u6458\u8981"]);

  const previewButton = page.getByRole("button", { name: "\u9884\u89c8" }).first();
  await previewButton.waitFor({ state: "visible", timeout: 10000 });
  await previewButton.click();

  await assertAnyText(page, ["\u6a21\u677f\u9884\u89c8", "\u6d41\u7a0b\u7ed3\u6784\u9884\u89c8"]);
  await assertAnyText(page, ["\u8282\u70b9\u6e05\u5355"]);
}

async function captureDiagnostics(page) {
  let title = "";
  let bodySnippet = "";
  try {
    title = await page.title();
  } catch {}
  try {
    const bodyText = await page.textContent("body");
    bodySnippet = normalizeText(bodyText).slice(0, 600);
  } catch {}
  return {
    finalUrl: page.url(),
    title,
    bodySnippet,
  };
}

async function openAndCheck(context, item) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const responseFailures = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error?.message || String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "UNKNOWN",
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      responseFailures.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  try {
    await page.goto(`${uiBaseUrl}${item.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(item.waitAfterLoad ?? 1200);
    await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
    await ensureLoggedIn(page);

    if (item.expectTexts?.length) {
      await assertAnyText(page, item.expectTexts);
    }
    if (item.assert) {
      await item.assert(page);
    }

    const blockingPageErrors = pageErrors.slice(0, 10);
    const ignoredRequestFailures = requestFailures.filter(shouldIgnoreRequestFailure).slice(0, 10);
    const blockingRequestFailures = requestFailures
      .filter((entry) => !shouldIgnoreRequestFailure(entry))
      .slice(0, 10);
    const blockingResponseFailures = responseFailures.slice(0, 10);

    if (blockingPageErrors.length > 0 || blockingRequestFailures.length > 0 || blockingResponseFailures.length > 0) {
      throw new Error(
        buildBlockingIssueMessage(
          blockingPageErrors,
          blockingRequestFailures,
          blockingResponseFailures,
        ),
      );
    }

    const diagnostics = await captureDiagnostics(page);
    await page.close();
    return {
      name: item.name,
      status: "passed",
      path: item.path,
      pageErrors: blockingPageErrors,
      consoleErrors: consoleErrors.slice(0, 10),
      requestFailures: blockingRequestFailures,
      ignoredRequestFailures,
      responseFailures: blockingResponseFailures,
      diagnostics,
    };
  } catch (error) {
    const diagnostics = await captureDiagnostics(page);
    await page.close();
    return {
      name: item.name,
      status: "failed",
      path: item.path,
      error: summarizeError(error),
      pageErrors: pageErrors.slice(0, 10),
      consoleErrors: consoleErrors.slice(0, 10),
      requestFailures: requestFailures.filter((entry) => !shouldIgnoreRequestFailure(entry)).slice(0, 10),
      ignoredRequestFailures: requestFailures.filter(shouldIgnoreRequestFailure).slice(0, 10),
      responseFailures: responseFailures.slice(0, 10),
      diagnostics,
    };
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const rawSessions = await readSessions();
  const adminSession = await buildSession(getRuntimeSession(rawSessions, "admin"));
  const zhangSession = await buildSession(getRuntimeSession(rawSessions, "zhang"));
  const workflowId = await resolveDynamicWorkflowId(adminSession.token);

  const browser = await chromium.launch({ headless: true });
  const adminContext = await createContext(browser, adminSession);
  const zhangContext = await createContext(browser, zhangSession);

  const adminChecks = [
    { name: "UI-\u6d41\u7a0b\u8bbe\u8ba1", path: "/workflow/design", assert: assertWorkflowDesign, waitAfterLoad: 1800 },
    { name: "UI-\u6d41\u7a0b\u7ba1\u7406", path: "/workflow/management", expectTexts: ["\u6d41\u7a0b\u7ba1\u7406"] },
    { name: "UI-\u5de5\u4f5c\u6d41\u76d1\u63a7", path: "/workflow/monitor", expectTexts: ["\u5de5\u4f5c\u6d41\u76d1\u63a7\u5927\u5c4f", "\u5de5\u4f5c\u6d41\u76d1\u63a7"] },
    { name: "UI-\u53d1\u5e03\u7ba1\u7406", path: "/workflow/deploy", expectTexts: ["\u53d1\u5e03\u7ba1\u7406"] },
    { name: "UI-\u6d41\u7a0b\u5bfc\u5165", path: "/workflow/import", expectTexts: ["\u6d41\u7a0b\u5bfc\u5165"] },
    { name: "UI-\u5f52\u6863\u6d41\u7a0b\u7ba1\u7406", path: "/workflow/archived", expectTexts: ["\u5f52\u6863\u6d41\u7a0b\u7ba1\u7406"] },
    { name: "UI-\u6d41\u7a0b\u5206\u7c7b\u7ba1\u7406", path: "/workflow/category", expectTexts: ["\u6d41\u7a0b\u5206\u7c7b\u7ba1\u7406"] },
    { name: "UI-\u7248\u672c\u5386\u53f2", path: `/workflow/versions/${workflowId}`, expectTexts: ["\u7248\u672c\u5386\u53f2"] },
    { name: "UI-\u6a21\u677f\u5e93", path: "/templates", assert: assertTemplateLibrary, waitAfterLoad: 1600 },
    { name: "UI-\u7528\u6237\u7ba1\u7406", path: "/system/users", expectTexts: ["\u7528\u6237\u7ba1\u7406"] },
    { name: "UI-\u89d2\u8272\u7ba1\u7406", path: "/system/roles", expectTexts: ["\u89d2\u8272\u7ba1\u7406"] },
    { name: "UI-\u83dc\u5355\u7ba1\u7406", path: "/system/menus", expectTexts: ["\u83dc\u5355\u7ba1\u7406"] },
    { name: "UI-\u6587\u4ef6\u7ba1\u7406", path: "/system/files", expectTexts: ["\u6587\u4ef6\u7ba1\u7406"] },
    { name: "UI-\u79df\u6237\u7ba1\u7406", path: "/system/tenant", expectTexts: ["\u79df\u6237\u7ba1\u7406"] },
    { name: "UI-\u5c97\u4f4d\u7ba1\u7406", path: "/system/post", expectTexts: ["\u5c97\u4f4d\u7ba1\u7406"] },
    { name: "UI-\u53c2\u6570\u914d\u7f6e", path: "/system/config", expectTexts: ["\u53c2\u6570\u914d\u7f6e"] },
    { name: "UI-\u7f13\u5b58\u76d1\u63a7", path: "/system/cache", expectTexts: ["\u7f13\u5b58\u76d1\u63a7"] },
    { name: "UI-\u64cd\u4f5c\u65e5\u5fd7", path: "/system/log", expectTexts: ["\u64cd\u4f5c\u4eba", "\u8bf7\u6c42\u65f6\u95f4"] },
    { name: "UI-\u5ba1\u8ba1\u65e5\u5fd7", path: "/system/audit-log", expectTexts: ["\u4e1a\u52a1\u540d\u79f0", "\u4e1a\u52a1\u6a21\u5757"] },
  ];

  const zhangChecks = [
    { name: "UI-\u4efb\u52a1\u4e2d\u5fc3", path: "/tasks", expectTexts: ["\u4efb\u52a1\u4e2d\u5fc3"] },
    { name: "UI-\u6211\u7684\u7533\u8bf7", path: "/my-apps", expectTexts: ["\u6211\u7684\u7533\u8bf7"] },
    { name: "UI-\u6284\u9001\u6211\u7684", path: "/my-copies", expectTexts: ["\u6284\u9001\u6211\u7684"] },
    { name: "UI-\u53d1\u8d77\u4e1a\u52a1\u6d41\u7a0b", path: "/workplace", expectTexts: ["\u53d1\u8d77\u4e1a\u52a1\u6d41\u7a0b"] },
  ];

  const results = [];
  try {
    for (const item of adminChecks) {
      results.push(await openAndCheck(adminContext, item));
    }
    for (const item of zhangChecks) {
      results.push(await openAndCheck(zhangContext, item));
    }
  } finally {
    await adminContext.close();
    await zhangContext.close();
    await browser.close();
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    uiBaseUrl,
    gatewayBaseUrl,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2), "utf-8");
  console.log(
    JSON.stringify({
      passed: report.passed,
      failed: report.failed,
      output: outputFile,
    }),
  );
  process.exit(report.failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    uiBaseUrl,
    gatewayBaseUrl,
    passed: 0,
    failed: 1,
    results: [
      {
        name: "UI-\u811a\u672c\u521d\u59cb\u5316",
        status: "failed",
        error: summarizeError(error),
      },
    ],
  };
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2), "utf-8");
  console.error(report.results[0].error);
  process.exit(1);
});
