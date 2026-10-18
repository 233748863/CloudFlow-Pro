import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import axios, { AxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import ts from 'typescript';

function loadSource(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('import.meta.env', '__env');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name: string) => { assert.ok(name in dependencies, `未声明的依赖: ${name}`); return dependencies[name]; },
    __env: { BASE_URL: '/', PROD: true, DEV: false },
    crypto: webcrypto, Blob, TextDecoder, console,
    navigator: { onLine: true, userAgent: 'basic-trace-check' },
    window: { location: { href: 'http://localhost/business', pathname: '/business' }, addEventListener: () => {} },
    document: { cookie: '' }, setTimeout: () => 0,
  });
  return module.exports;
}
const auth = loadSource('../src/utils/authStorage.ts', {});
auth.setAuthToken('test-token');
auth.setCurrentUserSnapshot({ userId: '1001', tenantId: '10' });
const trace = loadSource('../src/utils/trace.ts', { '@/utils/authStorage': auth });
const request = loadSource('../src/services/api/request.ts', {
  axios: { ...axios, default: axios },
  sonner: { toast: { error: () => {}, warning: () => {} } },
  '@/constants/api': { API_TIMEOUT: 30000, API_SUCCESS_CODE: 200, API_ERROR_CODES: { UNAUTHORIZED: 401 } },
  '@/utils/errorHandler': { handleApiError: () => {} },
  '@/utils/sessionCleanup': { clearAuthSession: () => { auth.removeAuthToken(); auth.clearCurrentUserSnapshot(); } },
  '@/utils/authStorage': auth,
  '@/utils/navigation': { navigateTo: () => {} },
  '@/services/desktopConfig': { isTauriRuntime: () => false, loadDesktopRuntimeConfig: async () => ({ apiBaseUrl: '/api' }) },
  '@/utils/trace': trace, '@/utils/formFieldErrors': { getFormFieldErrors: () => ({}) },
}).default as AxiosInstance;
const recent = 'recent_request_00001';
const supplied = 'explicit_context_001';
const failed = 'failed_request_00001';
const reportTrace = 'report_response_0001';
const reports: Array<{ data: { traceId?: string }; config: any }> = [];
const pending: Promise<unknown>[] = [];
const reporter = loadSource('../src/services/errorReporter.ts', {
  '@/utils/trace': trace,
  '@/services/api/request': { default: { post: (url: string, data: { traceId?: string }, config: any) => {
    reports.push({ data, config });
    const result = request.post(url, data, { ...config, adapter: async actual => ({
      data: { code: 200, data: true }, status: 200, statusText: 'OK', headers: { 'x-trace-id': reportTrace }, config: actual,
    }) });
    pending.push(result);
    return result;
  } } },
}).errorReporter;
async function completeRequest(id: string) {
  return request.get('/business', { adapter: async config => ({
    data: { code: 200, data: 'saved' }, status: 200, statusText: 'OK', headers: { 'x-trace-id': id }, config,
  }) });
}
assert.equal(trace.getRecentRequestTraceId(), undefined);
reporter.captureError(new Error('首次页面错误'));
assert.equal(reports.at(-1)?.data.traceId, undefined);
await Promise.all(pending.splice(0));
assert.equal(trace.getRecentRequestTraceId(), undefined);
console.log('PASS 无业务请求时不虚构关联编号，上报响应不成为业务编号');
assert.equal(await completeRequest(recent), 'saved');
assert.equal(trace.getRecentRequestTraceId(), recent);
reporter.captureError(new Error('成功请求后的页面错误'));
reporter.captureWarning('页面提示');
assert.equal(reports.at(-2)?.data.traceId, recent);
assert.equal(reports.at(-1)?.data.traceId, recent);
await Promise.all(pending.splice(0));
assert.equal(trace.getRecentRequestTraceId(), recent);
assert.equal(reports.at(-1)?.config.trackRequestTrace, false);
assert.equal(reports.at(-1)?.config.headers['X-Trace-Id'], recent);
console.log('PASS 普通页面错误和警告采用最近完成请求编号，上报不覆盖');
const originalFailure = trace.attachTraceId(new Error('原请求错误'), failed);
reporter.captureError(originalFailure);
reporter.captureError(originalFailure, { traceId: supplied });
assert.equal(reports.at(-2)?.data.traceId, failed);
assert.equal(reports.at(-1)?.data.traceId, supplied);
await Promise.all(pending.splice(0));
console.log('PASS 显式上下文及原始错误编号优先，保持原失败请求归属');
await assert.rejects(request.get('/business-failure', { adapter: async config => {
  throw new AxiosError('bad request', 'ERR_BAD_RESPONSE', config, undefined, {
    data: { msg: '业务失败' }, status: 500, statusText: 'ERROR', headers: { 'x-trace-id': failed }, config,
  });
} }), (error: unknown) => trace.errorTraceId(error) === failed);
assert.equal(trace.getRecentRequestTraceId(), failed);
console.log('PASS 失败响应保留服务端编号且可供后续页面错误关联');
let finishOld: (() => void) | undefined;
let startOld: (() => void) | undefined;
const started = new Promise<void>(resolve => { startOld = resolve; });
const oldRequest = request.get('/slow', { adapter: (config: InternalAxiosRequestConfig) => new Promise(resolve => {
  finishOld = () => resolve({ data: { code: 200, data: true }, status: 200, statusText: 'OK', headers: { 'x-trace-id': recent }, config });
  startOld?.();
}) });
await started;
auth.setAuthToken('next-session');
auth.setCurrentUserSnapshot({ userId: '1002', tenantId: '20' });
assert.equal(trace.getRecentRequestTraceId(), undefined);
finishOld?.();
await oldRequest;
assert.equal(trace.getRecentRequestTraceId(), undefined);
console.log('PASS 账号及会话切换后清除旧编号，旧请求晚到不能回填');
await completeRequest(supplied);
auth.setCurrentUserSnapshot({ userId: '1002', tenantId: '21' });
assert.equal(trace.getRecentRequestTraceId(), undefined);
await completeRequest(recent);
auth.removeAuthToken();
assert.equal(trace.getRecentRequestTraceId(), undefined);
console.log('PASS 同账号切换租户与退出登录均隔离最近编号');
console.log('ERROR_TRACE_CONTEXT_BASIC: checks=6; failed=0; production-source=true; real-axios=true; mocked-network=true; browser=false; artifacts=none');
