import assert from 'node:assert/strict';
import { captureMobileScope, clearMobileSnapshots, isMobileScopeCurrent, MOBILE_SNAPSHOT_TTL, readLastMobileSnapshots, readMobileSnapshot, saveMobileSnapshot, type MobileTodoSummary } from '../src/utils/mobileSnapshots';
import { invalidateAuthRequests, setCurrentUserSnapshot } from '../src/utils/authStorage';

const memory: Record<string, string> = {};
const storage = new Proxy(memory, { get(target, key) {
  if (key === 'getItem') return (name: string) => target[name] ?? null;
  if (key === 'setItem') return (name: string, value: string) => { target[name] = value; };
  if (key === 'removeItem') return (name: string) => { delete target[name]; };
  return target[String(key)];
} });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
let checks = 0;
function check(label: string, run: () => void) { run(); checks++; console.log(`PASS ${label}`); }
const todo = { total: 21, counts: { pending: 21, completed: 2, myApplications: 3 },
  tasks: Array.from({ length: 25 }, (_, i) => ({ id: String(i), taskName: '审批', processName: '请假', applicantName: '张三', createTime: '2026-10-17',
    status: 'pending', workflowTask: { formData: { password: 'DO_NOT_SAVE' } }, token: 'DO_NOT_SAVE' })) };
check('无身份或无租户时不存摘要', () => {
  setCurrentUserSnapshot(null); assert.equal(saveMobileSnapshot(captureMobileScope(), 'todo', todo), false);
  setCurrentUserSnapshot({ id: '1' }); assert.equal(captureMobileScope(), null);
});
setCurrentUserSnapshot({ id: '1', tenantId: 10 });
const first = captureMobileScope();
check('保存和读取待办摘要，最多20条', () => {
  assert.equal(saveMobileSnapshot(first, 'todo', todo), true);
  assert.equal(readMobileSnapshot(first, 'todo')?.data.tasks.length, 20);
  assert.equal(readMobileSnapshot(first, 'todo')?.data.total, 21);
});
check('白名单存储排除令牌与表单内容', () => {
  assert.ok(!JSON.stringify(memory).includes('DO_NOT_SAVE')); assert.ok(!JSON.stringify(memory).includes('workflowTask'));
});
check('同租户不同用户不能读到他人摘要', () => {
  setCurrentUserSnapshot({ id: '2', tenantId: 10 }); assert.equal(readMobileSnapshot(captureMobileScope(), 'todo'), null);
});
check('同用户不同租户不能读到其他租户摘要', () => {
  setCurrentUserSnapshot({ id: '1', tenantId: 11 }); assert.equal(readMobileSnapshot(captureMobileScope(), 'todo'), null);
});
check('身份改变后旧请求不能写回摘要', () => {
  assert.equal(saveMobileSnapshot(first, 'todo', todo), false);
  setCurrentUserSnapshot({ id: '1', tenantId: 10 }); invalidateAuthRequests();
  assert.equal(isMobileScopeCurrent(first), false); assert.equal(saveMobileSnapshot(first, 'todo', todo), false);
});
check('刷新后未恢复身份，只读入口仍可取摘要', () => {
  setCurrentUserSnapshot(null); assert.ok(readLastMobileSnapshots()?.todo); assert.equal(captureMobileScope(), null);
});
setCurrentUserSnapshot({ id: '1', tenantId: 10 });
const current = captureMobileScope();
check('工作台摘要只保留5条任务及50条日程', () => {
  saveMobileSnapshot(current, 'dashboard', { stats: { pendingTasks: 21, todaySchedules: 51, unreadMessages: 3 },
    tasks: Array.from({ length: 6 }, (_, i) => ({ taskId: String(i), taskName: '审批', processName: '请假', applicant: '张三', deadline: '', priority: 'medium', status: 'pending', secret: 'DO_NOT_SAVE' })),
    schedules: Array.from({ length: 51 }, (_, i) => ({ eventId: String(i), title: '会议', startTime: '2026-10-17', description: 'DO_NOT_SAVE' })) });
  const value = readMobileSnapshot(current, 'dashboard')?.data;
  assert.equal(value?.tasks.length, 5); assert.equal(value?.schedules.length, 50); assert.ok(!JSON.stringify(memory).includes('DO_NOT_SAVE'));
});
check('过期摘要失效并删除', () => {
  const original = Date.now; const now = original();
  try { Date.now = () => now + MOBILE_SNAPSHOT_TTL + 1; assert.equal(readMobileSnapshot(current, 'todo'), null); } finally { Date.now = original; }
});
check('新身份成功保存时清掉旧身份摘要', () => {
  setCurrentUserSnapshot({ id: '2', tenantId: 11 }); saveMobileSnapshot(captureMobileScope(), 'todo', todo);
  assert.equal(readMobileSnapshot(current, 'dashboard'), null);
});
check('退出清理仅删除摘要，不删除其他会话配置', () => {
  memory.unrelated = 'keep'; clearMobileSnapshots(); assert.equal(readLastMobileSnapshots(), null); assert.deepEqual(memory, { unrelated: 'keep' });
});
check('损坏或禁用存储不阻断业务', () => {
  const scope = captureMobileScope(); saveMobileSnapshot(scope, 'todo', todo);
  const key = Object.keys(memory).find(value => value.endsWith(':todo'))!; memory[key] = '{broken';
  assert.equal(readMobileSnapshot(scope, 'todo'), null);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.equal(saveMobileSnapshot(scope, 'todo', todo as MobileTodoSummary), false); clearMobileSnapshots();
});
console.log(`Completed ${checks} basic checks; no browser or build artifacts created.`);
