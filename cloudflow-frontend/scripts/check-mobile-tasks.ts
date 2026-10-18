import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';

// 直接执行正式页面；hooks、网络、外层控件使用替身，不启动浏览器或生成构建包。
type Element = React.ReactElement<Record<string, any>>;
const state: any[] = [];
let stateIndex = 0;
let online = true;
let version = 1;
let effect: (() => void) | undefined;
let checks = 0;
const calls: Array<{ mode: string; params: any }> = [];
const snapshots: any[] = [];
let total = 21;
let delayTodo: ((value: unknown) => void) | undefined;
const user = { id: '7', tenantId: '3' };
const reactMock = { ...React,
  useState: (initial: any) => {
    const index = stateIndex++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next: any) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  },
  useRef: (initial: any) => { const index = stateIndex++; return state[index] ??= { current: initial }; },
  useCallback: (body: unknown) => body,
  useEffect: (body: () => void) => { effect = body; },
};
const component = (name: string) => Object.assign(() => null, { displayName: name });
const Button = component('Button');
const Input = component('Input');
const Drawer = component('MobileFilterDrawer');
const Modal = component('TaskHandleModal');
const record = { id: 'task-21', nodeName: '审批', workflowName: '请假', applicantName: '本人',
  createdTime: '2026-10-17T09:00:00', status: 'PENDING', priority: 'HIGH' };
const result = () => ({ records: total ? [record] : [], total });
const api = (mode: string) => async (params: any) => {
  calls.push({ mode, params });
  if (mode === 'todo' && delayTodo) return new Promise(resolve => { delayTodo = resolve; });
  return result();
};
const dependencies: Record<string, any> = {
  react: { ...reactMock, default: reactMock, __esModule: true },
  'react-router-dom': { useNavigate: () => () => {} },
  'lucide-react': new Proxy({}, { get: (_, key) => component(String(key)) }),
  '@/services/api/workflow': { getTodoTasks: api('todo'), getDoneTasks: api('done'), getTasksCount: async () => ({ pending: 21, completed: 4, myApplications: 2 }) },
  '@/hooks/usePullToRefresh': { usePullToRefresh: () => ({ isRefreshing: false, pullDistance: 0, isPulling: false }) },
  sonner: { toast: { success: () => {} } },
  '@/context/AuthContext': { useAuth: () => ({ user, hasPermission: () => true }) },
  '@/components/TaskHandleModal': { TaskHandleModal: Modal },
  '@/components/workflow/ApprovalWithdrawalButton': { ApprovalWithdrawalButton: component('ApprovalWithdrawalButton') },
  '@/components/workflow/PendingSignatureButton': { PendingSignatureButton: component('PendingSignatureButton') },
  '@/components/common': { Button, Input },
  '@/components/mobile/MobileFilterDrawer': { MobileFilterDrawer: Drawer },
  '@/utils/mappers': { mapBackendTaskToFrontend: (value: unknown) => value },
  '@/utils/workflowPermissions': { isTaskInCurrentTodo: () => false },
  '@/utils/errorMessage': { getErrorMessage: (_: unknown, fallback: string) => fallback },
  '@/types': { TaskStatus: { PENDING: 'PENDING' } },
  '@/hooks/useOffline': { useNetworkStatus: () => online },
  '@/utils/authStorage': { getAuthSessionVersion: () => version },
  '@/utils/mobileSnapshots': { captureMobileScope: () => ({ key: '3:7', version }),
    saveMobileSnapshot: (_: unknown, __: unknown, value: unknown) => snapshots.push(value), removeMobileSnapshot: () => {},
    readMobileSnapshot: () => ({ savedAt: 1, data: { tasks: [{ ...record, taskName: '离线审批', processName: '请假' }], total: 21, counts: { pending: 21, completed: 4, myApplications: 2 } } }) },
};
const compiled = { exports: {} as Record<string, any> };
const code = ts.transpileModule(readFileSync(new URL('../src/mobile/pages/MobileTasks.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { module: compiled, exports: compiled.exports, Date, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`); return dependencies[name];
} });
function nodes(value: React.ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element; return [element, ...nodes(element.props.children)];
}
function render() { stateIndex = 0; return nodes(compiled.exports.MobileTasks({})); }
async function load() { render(); effect!(); await new Promise(resolve => setImmediate(resolve)); return render(); }
const named = (tree: Element[], label: string) => tree.find(node => node.props['aria-label'] === label)!;
const button = (tree: Element[], label: string) => tree.find(node => node.type === Button && node.props.children === label)!;
const drawer = () => render().find(node => node.type === Drawer)!;
const input = (label: string) => {
  const field = render().find(node => node.type === 'label' && nodes(node.props.children).some(child => child.type === Input)
    && (node.props.children as any[])[0] === label)!;
  return nodes(field.props.children).find(node => node.type === Input)!;
};
const change = (label: string, value: string) => input(label).props.onChange({ target: { value } });
async function check(label: string, body: () => void | Promise<void>) { await body(); checks++; console.log(`PASS ${label}`); }
await check('待办首屏使用分页参数并保存无筛选首页摘要', async () => {
  const tree = await load(); assert.equal(calls.at(-1)!.mode, 'todo');
  assert.equal(calls.at(-1)!.params.pageNum, 1); assert.equal(calls.at(-1)!.params.pageSize, 20);
  assert.ok(named(tree, '待办分页')); assert.equal(button(tree, '下一页').props.disabled, false); assert.equal(snapshots.length, 1);
});
await check('超过20条的待办可进入下一页且不覆盖首页离线摘要', async () => {
  button(render(), '下一页').props.onClick(); const tree = await load(); assert.equal(calls.at(-1)!.params.pageNum, 2);
  assert.equal(button(tree, '下一页').props.disabled, true); assert.equal(button(tree, '上一页').props.disabled, false); assert.equal(snapshots.length, 1);
});
await check('筛选按钮打开抽屉，取消不提交条件', () => {
  named(render(), '筛选').props.onClick(); assert.equal(drawer().props.open, true);
  change('流程标题或编号', '取消内容'); drawer().props.onClose(); assert.equal(drawer().props.open, false);
  named(render(), '筛选').props.onClick(); assert.equal(input('流程标题或编号').props.value, '');
});
await check('申请人日期关键词提交至服务端并重置至第一页', async () => {
  change('流程标题或编号', '  请假  '); change('申请人', '  员工  '); change('开始日期', '2026-10-01'); change('结束日期', '2026-10-17');
  drawer().props.onApply(); await load(); const params = calls.at(-1)!.params;
  assert.equal(params.pageNum, 1); assert.equal(params.keyword, '请假'); assert.equal(params.startUserName, '员工');
  assert.equal(params.startTimeFrom, '2026-10-01'); assert.equal(params.startTimeTo, '2026-10-17'); assert.equal(snapshots.length, 1);
});
await check('日期倒置明确提示并保留抽屉，重置后可清除全部条件', async () => {
  named(render(), '筛选').props.onClick(); change('开始日期', '2026-10-18'); drawer().props.onApply();
  assert.equal(drawer().props.open, true); assert.ok(render().find(node => node.props.role === 'alert' && node.props.children === '开始日期不能晚于结束日期'));
  drawer().props.onReset(); assert.equal(input('申请人').props.value, ''); assert.equal(input('开始日期').props.value, '');
  drawer().props.onApply(); await load(); assert.equal(calls.at(-1)!.params.keyword, undefined);
});
await check('已办保留分页并使用同一筛选入口', async () => {
  render().find(node => node.type === 'button' && node.props.children === '已办')!.props.onClick();
  const tree = await load(); assert.equal(calls.at(-1)!.mode, 'done'); assert.ok(named(tree, '已办分页'));
  named(tree, '筛选').props.onClick(); assert.equal(drawer().props.title, '已办筛选'); drawer().props.onClose();
});
await check('最后一条办理后空页回到有效页码', async () => {
  button(render(), '下一页').props.onClick(); await load(); total = 20; await load(); await load();
  assert.equal(calls.at(-1)!.params.pageNum, 1); assert.equal(button(render(), '下一页').props.disabled, true);
});
await check('离线只读摘要不发查询，不提供分页或审批', async () => {
  render().find(node => node.type === 'button' && node.props.children === '全部')!.props.onClick(); online = false;
  const before = calls.length; const tree = await load(); assert.equal(calls.length, before);
  assert.equal(named(tree, '筛选').props.disabled, true); assert.equal(named(tree, '待办分页'), undefined);
  assert.ok(!tree.some(node => node.type === Modal)); assert.equal(tree.find(node => node.props['data-task-id'])!.props['aria-disabled'], true);
});
await check('切换身份后的旧异步响应不能覆盖列表', async () => {
  online = true; total = 21; delayTodo = () => {}; render(); effect!();
  const savedBefore = snapshots.length; version++; delayTodo!(result());
  await new Promise(resolve => setImmediate(resolve)); assert.equal(snapshots.length, savedBefore); delayTodo = undefined;
});
console.log(`MOBILE_TASKS_BASIC: checks=${checks}; failed=0; production-page=true; mocked-hooks-and-api=true; browser=false; artifacts=none`);
