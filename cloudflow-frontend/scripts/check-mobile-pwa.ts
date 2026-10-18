import assert from 'node:assert/strict';
import { watchPwaUpdates } from '../src/utils/pwaUpdates';
import { findMobileDesktopPage, MOBILE_DESKTOP_PAGES } from '../src/config/mobileDesktopPages';

class Worker extends EventTarget {
  state = 'installed';
  messages: unknown[] = [];
  fail = false;
  postMessage(message: unknown) {
    if (this.fail) throw new Error('message failed');
    this.messages.push(message);
  }
}
class Registration extends EventTarget {
  waiting: Worker | null = null;
  installing: Worker | null = null;
}
class Container extends EventTarget {
  controller: Worker | null = new Worker();
  registration = new Registration();
  rejected = false;
  async register() {
    if (this.rejected) throw new Error('registration failed');
    return this.registration;
  }
}
let checks = 0;
function check(label: string, run: () => void) { run(); checks++; console.log(`PASS ${label}`); }
async function setup(container = new Container()) {
  const available: boolean[] = [];
  let errors = 0;
  let reloads = 0;
  const manager = watchPwaUpdates({
    serviceWorker: container as unknown as ServiceWorkerContainer, scriptUrl: '/sw.js',
    onAvailable: value => available.push(value), onError: () => errors++, reload: () => reloads++,
  });
  await Promise.resolve(); await Promise.resolve();
  return { container, manager, available, errors: () => errors, reloads: () => reloads };
}

const initial = new Container(); initial.controller = null; initial.registration.waiting = new Worker();
const first = await setup(initial);
check('首次安装不提示更新', () => assert.deepEqual(first.available, [])); first.manager.dispose();
const waiting = new Container(); waiting.registration.waiting = new Worker();
const ready = await setup(waiting);
check('已有等待版本时显示提示且不自动刷新', () => { assert.deepEqual(ready.available, [true]); assert.equal(ready.reloads(), 0); });
ready.container.dispatchEvent(new Event('controllerchange'));
check('其他页面激活版本不刷新当前未确认页面', () => assert.equal(ready.reloads(), 0));
ready.manager.applyUpdate(); ready.manager.applyUpdate();
check('确认更新只发送一次激活消息', () => assert.deepEqual(waiting.registration.waiting?.messages, [{ type: 'SKIP_WAITING' }]));
ready.container.dispatchEvent(new Event('controllerchange')); ready.container.dispatchEvent(new Event('controllerchange'));
check('本页确认后仅刷新一次', () => assert.equal(ready.reloads(), 1)); ready.manager.dispose();
const discovered = await setup();
const installing = new Worker(); installing.state = 'installing';
discovered.container.registration.installing = installing;
discovered.container.registration.dispatchEvent(new Event('updatefound'));
discovered.container.registration.waiting = installing; installing.state = 'installed'; installing.dispatchEvent(new Event('statechange'));
check('运行中发现新版本显示提示', () => assert.deepEqual(discovered.available, [true]));
discovered.manager.dispose(); discovered.container.dispatchEvent(new Event('controllerchange'));
check('销毁后不回调或刷新', () => { assert.deepEqual(discovered.available, [true]); assert.equal(discovered.reloads(), 0); });
const retryContainer = new Container(); const retryWorker = new Worker(); retryWorker.fail = true; retryContainer.registration.waiting = retryWorker;
const retry = await setup(retryContainer); retry.manager.applyUpdate();
check('发送失败可报告错误', () => { assert.equal(retry.errors(), 1); assert.equal(retry.reloads(), 0); });
retryWorker.fail = false; retry.manager.applyUpdate(); retryContainer.dispatchEvent(new Event('controllerchange'));
check('失败后可重试更新', () => assert.equal(retry.reloads(), 1)); retry.manager.dispose();
const absent = await setup(); absent.manager.applyUpdate();
check('等待版本已消失时关闭提示', () => assert.deepEqual(absent.available, [false])); absent.manager.dispose();
const failedContainer = new Container(); failedContainer.rejected = true; const failed = await setup(failedContainer);
check('注册失败保持在线页面', () => { assert.equal(failed.reloads(), 0); assert.deepEqual(failed.available, []); }); failed.manager.dispose();
check('集中配置的管理入口均匹配', () => MOBILE_DESKTOP_PAGES.forEach(page => assert.equal(findMobileDesktopPage(`${page.path}/`)?.path, page.path)));
check('设计器子路由匹配', () => assert.equal(findMobileDesktopPage('/workflow/design/123')?.path, '/workflow/design'));
check('业务入口及报表查看保持开放', () => ['/hr/attendance', '/hr/leave', '/office/project/tasks', '/report/chart', '/report/dashboard', '/forms-other', '/'].forEach(page => assert.equal(findMobileDesktopPage(page), undefined)));
console.log(`Completed ${checks} basic checks; no build or browser artifacts created.`);
