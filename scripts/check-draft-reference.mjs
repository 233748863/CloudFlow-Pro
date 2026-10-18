import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(new URL('../cloudflow-frontend/package.json', import.meta.url));
const ts = require('typescript');
const sourceRoot = new URL('../cloudflow-frontend/src/', import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let turn = 0; turn < 12; turn += 1) await Promise.resolve(); };
let passed = 0;
const check = async (name, operation) => {
  try { await operation(); passed += 1; }
  catch (cause) { throw new Error(name, { cause }); }
};
const loadSource = (relativePath, modules, globals = {}) => {
  const filename = fileURLToPath(new URL(relativePath, sourceRoot));
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports, AbortController,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `不允许访问依赖 ${name}`);
      return modules[name];
    },
    ...globals,
  }, { filename });
  return compiled.exports;
};
const elements = (node) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children), ...elements(node.props?.footer), ...elements(node.props?.headerAside)];
};
const find = (tree, type) => elements(tree).find((element) => element.type === type)?.props;

function reactHarness() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let dirty = false;
  let alive = true;
  let lateWrites = 0;
  let renderFunction;
  let tree;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } }),
    forwardRef: (render) => render,
    useState: (initial) => {
      const slot = cursor++;
      if (!Object.hasOwn(slots, slot)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (next) => {
        if (!alive) { lateWrites += 1; return; }
        const value = typeof next === 'function' ? next(slots[slot]) : next;
        if (!Object.is(value, slots[slot])) { slots[slot] = value; dirty = true; }
      }];
    },
    useRef: (initial) => {
      const slot = cursor++;
      if (!Object.hasOwn(slots, slot)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useImperativeHandle: (ref, factory) => { ref.current = factory(); },
    useLayoutEffect: (effect, dependencies) => {
      const slot = cursor++;
      const previous = slots[slot];
      if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
      slots[slot] = { dependencies, cleanup: previous?.cleanup };
      pending.push(() => { slots[slot].cleanup?.(); slots[slot].cleanup = effect(); });
    },
  };
  const renderOnce = () => { cursor = 0; dirty = false; tree = renderFunction(); };
  const commit = () => {
    let turns = 0;
    while (pending.length || dirty) {
      assert.ok(turns++ < 20, '渲染不应循环');
      const effects = pending;
      pending = [];
      effects.forEach((effect) => effect());
      if (dirty) renderOnce();
    }
    return tree;
  };
  return {
    react: { __esModule: true, default: react, ...react },
    draw: (render, flush = true) => { renderFunction = render; renderOnce(); return flush ? commit() : tree; },
    commit,
    unmount: () => { alive = false; slots.forEach((slot) => slot?.cleanup?.()); },
    remount: () => { alive = true; slots.length = 0; pending = []; dirty = false; },
    lateWrites: () => lateWrites,
  };
}

const runtime = loadSource('utils/formFieldRuntime.ts', {});
const draftTypes = loadSource('services/api/workflow/draftTypes.ts', {});
const controlNames = ['BaseDialog', 'Button', 'DatePicker', 'DeptSelector', 'EmployeeSelector', 'Input', 'PositionSelector', 'PostSelector', 'Textarea', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue', 'WorkspaceInlineState', 'AlertTriangle', 'FileText', 'Send'];
const controls = Object.fromEntries(controlNames.map((name) => [name, name]));
const form = {
  id: 'form-test', name: '九类字段',
  fields: ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA', 'EMPLOYEE', 'DEPT', 'POST', 'POSITION'].map((type) => ({
    id: type.toLowerCase(), type, label: type, required: true, ...(type === 'SELECT' ? { options: ['选项'] } : {}),
  })),
};
const formData = { text: '文字', number: 0, date: '2026-09-14', select: '选项', textarea: '多行', employee: '9007199254740993', dept: '200', post: '300', position: '400' };
function rendererFixture() {
  const hooks = reactHarness();
  const module = loadSource('components/FormRenderer.tsx', {
    react: hooks.react, 'lucide-react': controls, '@/components/common': controls, './common/select': controls,
    '@/components/workspace/WorkspacePrimitives': controls, '@/utils/cn': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@/utils/formFieldRuntime': runtime,
  }, { document: { getElementById: () => ({ scrollIntoView: () => undefined }) } });
  const ref = { current: null };
  return { ref, render: (props) => hooks.draw(() => module.FormRenderer(props, ref)) };
}

function referenceFixture(overrides = {}) {
  const hooks = reactHarness();
  const calls = [];
  const changes = [];
  let identity = 'tenant-a:user-a';
  let props = {
    identity, definitionId: 'definition-a', contextHash: 'context-a', enabled: true,
    field: { id: 'employee', type: 'EMPLOYEE', label: '员工', required: false },
    data: {}, value: '', disabled: false, onChange: (selection) => changes.push(selection), ...overrides,
  };
  const api = {
    ...draftTypes,
    getDraftReferenceOptions: (definitionId, fieldId, params, signal) => new Promise((resolve, reject) => {
      calls.push({ definitionId, fieldId, params, signal, resolve, reject });
    }),
  };
  const module = loadSource('components/workflow/drafts/WorkflowDraftReferenceField.tsx', {
    react: hooks.react, '@/components/common/button': controls, '@/components/common/SelectorShell': { SelectorShell: 'SelectorShell' },
    '@/hooks/useWorkflowDraft': { workflowDraftIdentity: (snapshot) => snapshot.identity },
    '@/utils/authStorage': { getCurrentUserSnapshot: () => ({ identity }) },
    '@/services/api/workflow/draft': api, '@/utils/formFieldRuntime': runtime,
  });
  return {
    calls, changes, hooks,
    render: (patch = {}, flush = true) => { props = { ...props, ...patch }; return hooks.draw(() => module.WorkflowDraftReferenceField(props), flush); },
    setIdentity: (next) => { identity = next; },
    respond: async (index, rows, total = rows.length, extra = {}) => {
      calls[index].resolve({ rows, total, ...plain(calls[index].params), ...extra });
      await settle();
    },
  };
}
const optionsPage = (count, start = 0) => Array.from({ length: count }, (_, index) => ({ id: String(9007199254740993n + BigInt(start + index)), label: `候选${start + index}` }));

await check('只读参考接口编码上下文并传递分页和取消信号', async () => {
  const calls = [];
  const api = loadSource('services/api/workflow/draft.ts', {
    '../request': { __esModule: true, default: { get: async (url, config) => { calls.push({ url, config }); return { rows: [], total: 0, pageNum: 2, pageSize: 100 }; } } },
    './draftTypes': draftTypes,
  });
  const controller = new AbortController();
  await api.getDraftReferenceOptions('流程/一', '员工/字段', { pageNum: 2, pageSize: 100 }, controller.signal);
  assert.equal(calls[0].url, `/workflow/wf/draft/context/${encodeURIComponent('流程/一')}/references/${encodeURIComponent('员工/字段')}`);
  assert.deepEqual(plain(calls[0].config.params), { pageNum: 2, pageSize: 100 });
  assert.equal(calls[0].config.signal, controller.signal);
  assert.equal(calls[0].config.silent, true);
  const decoded = calls[0].config.transformResponse[0](JSON.stringify({ code: 200, data: { rows: optionsPage(1) } }), {}, 200);
  assert.equal(decoded.data.rows[0].id, '9007199254740993');
  assert.throws(() => draftTypes.decodeDraftResponse({ code: 500, msg: 'DRAFT_REFERENCE_UNAVAILABLE: 私密信息' }, 200), (error) => error.code === 'DRAFT_REFERENCE_UNAVAILABLE' && !error.message.includes('私密信息'));
});

await check('未传参考回调时九类字段和原选择器保持不变', () => {
  const test = rendererFixture();
  let submitted;
  const tree = test.render({ formDef: form, data: formData, fieldPermissions: [], onSubmit: (data) => { submitted = data; } });
  const expected = ['Input', 'Input', 'DatePicker', 'Select', 'Textarea', 'EmployeeSelector', 'DeptSelector', 'PostSelector', 'PositionSelector'];
  form.fields.forEach((field, index) => {
    const container = elements(tree).find((element) => element.props?.id === `field-${field.id}`);
    assert.equal(find(container, expected[index]).value, formData[field.id]);
  });
  assert.equal(test.ref.current.validate(), true);
  test.ref.current.submit();
  assert.deepEqual(submitted, formData);
});

await check('可选回调仅接管四类参考字段且保持当前表单值', () => {
  const test = rendererFixture();
  const references = [];
  const tree = test.render({ formDef: form, data: formData, fieldPermissions: [], renderReferenceField: (props) => {
    references.push(props);
    return { type: 'DraftReference', props };
  } });
  assert.deepEqual(references.map((props) => props.field.type), ['EMPLOYEE', 'DEPT', 'POST', 'POSITION']);
  references.forEach((props) => { assert.equal(props.data, formData); assert.equal(props.value, formData[props.field.id]); });
  assert.equal(elements(tree).filter((element) => ['EmployeeSelector', 'DeptSelector', 'PostSelector', 'PositionSelector'].includes(element.type)).length, 0);
  assert.equal(elements(tree).filter((element) => ['Input', 'DatePicker', 'Select', 'Textarea'].includes(element.type)).length, 5);
  assert.deepEqual(test.ref.current.getData(), formData);
});

await check('参考变更保留字符串编号且不伪造员工或岗位明细', () => {
  const test = rendererFixture();
  const field = { ...form.fields[5], displayFieldId: 'employeeName', fillMappings: [
    { targetFieldId: 'mappedName', source: 'name' }, { targetFieldId: 'mappedId', source: 'id' },
    { targetFieldId: 'employeeNo', source: 'employeeNo' }, { targetFieldId: 'postName', source: 'postName' },
  ] };
  let reference;
  let changed;
  const props = { formDef: { ...form, fields: [field] }, data: { unrelated: '保留', employee: '1', employeeNo: '旧工号', postName: '旧岗位' }, onDataChange: (data) => { changed = data; }, renderReferenceField: (value) => { reference = value; return null; } };
  test.render(props);
  reference.onChange({ id: '9007199254740993', label: '服务端姓名' });
  assert.deepEqual(plain(changed), { unrelated: '保留', employee: '9007199254740993', employeeNo: '', postName: '', employeeName: '服务端姓名', mappedName: '服务端姓名', mappedId: '9007199254740993' });
  test.render({ ...props, data: changed });
  assert.deepEqual(plain(test.ref.current.getData()), plain(changed));
  reference.onChange(null);
  assert.equal(changed.employee, '');
  assert.equal(changed.employeeName, '');
});

await check('隐藏、只读及派生参考字段不渲染选择器', () => {
  const test = rendererFixture();
  const references = [];
  test.render({
    formDef: { ...form, fields: form.fields.map((field) => field.type === 'EMPLOYEE' ? { ...field, displayFieldId: 'position' } : field) },
    data: formData, fieldPermissions: [
      { nodeKey: '__START__', fieldId: 'dept', visibleFlag: false },
      { nodeKey: '__START__', fieldId: 'post', editableFlag: false },
    ], renderReferenceField: (props) => { references.push(props); return null; },
  });
  assert.deepEqual(references.map((props) => props.field.type), ['EMPLOYEE']);
  references.length = 0;
  test.render({ formDef: form, data: formData, readonly: true, renderReferenceField: (props) => { references.push(props); return null; } });
  assert.equal(references.length, 0);
});

await check('禁用表单回调无法改写值', () => {
  const test = rendererFixture();
  let reference;
  let changes = 0;
  test.render({ formDef: { ...form, fields: [form.fields[5]] }, data: formData, disabled: true, onDataChange: () => { changes += 1; }, renderReferenceField: (props) => { reference = props; return null; } });
  assert.equal(reference.disabled, true);
  reference.onChange({ id: '2', label: '候选' });
  assert.equal(changes, 0);
});

await check('串行读取完整分页并只向选择框传递编号和名称', async () => {
  const test = referenceFixture({ field: { id: 'employee', type: 'EMPLOYEE', onlyActive: false } });
  assert.equal(find(test.render(), 'SelectorShell').loading, true);
  assert.equal(test.calls.length, 1);
  assert.deepEqual(plain(test.calls[0].params), { pageNum: 1, pageSize: 100 });
  await test.respond(0, optionsPage(100).map((option) => ({ ...option, employeeNo: '不应保留' })), 103);
  assert.equal(test.calls.length, 2);
  assert.equal(test.calls[1].params.pageNum, 2);
  assert.equal(find(test.render(), 'SelectorShell').options.length, 0);
  await test.respond(1, optionsPage(3, 100), 103);
  const shell = find(test.render(), 'SelectorShell');
  assert.equal(shell.options.length, 103);
  assert.equal(shell.loading, false);
  assert.equal(shell.disabled, false);
  assert.deepEqual(Object.keys(shell.options[0]), ['id', 'label']);
  shell.onToggle(shell.options[102].id);
  assert.deepEqual(plain(test.changes), [optionsPage(1, 102)[0]]);
  assert.equal(test.calls.length, 2);
});

await check('恢复草稿名称在加载前后可见且不会触发自动改写', async () => {
  const test = referenceFixture({ field: { id: 'employee', type: 'EMPLOYEE', displayFieldId: 'employeeName' }, value: '9007199254740993', data: { employeeName: '恢复姓名' } });
  let shell = find(test.render(), 'SelectorShell');
  assert.deepEqual(plain(shell.options), [{ id: '9007199254740993', label: '恢复姓名', disabled: true }]);
  await test.respond(0, [{ id: '9007199254740993', label: '当前姓名' }]);
  shell = find(test.render(), 'SelectorShell');
  assert.deepEqual(plain(shell.value), ['9007199254740993']);
  assert.equal(shell.options[0].label, '当前姓名');
  assert.equal(test.changes.length, 0);
  shell.onRemove('9007199254740993');
  assert.deepEqual(plain(test.changes), [null]);
});

for (const [name, patch, nextIdentity] of [
  ['流程定义', { definitionId: 'definition-b' }],
  ['流程上下文', { contextHash: 'context-b' }],
  ['字段编号', { field: { id: 'another-employee', type: 'EMPLOYEE' } }],
  ['字段类型', { field: { id: 'employee', type: 'DEPT' } }],
  ['活动状态配置', { field: { id: 'employee', type: 'EMPLOYEE', onlyActive: false } }],
  ['登录身份', { identity: 'tenant-b:user-b' }, 'tenant-b:user-b'],
]) {
  await check(`${name}变化立即清空选项并重新读取`, async () => {
    const test = referenceFixture();
    test.render();
    await test.respond(0, [{ id: '1', label: '旧选项' }]);
    assert.equal(find(test.render(), 'SelectorShell').options.length, 1);
    if (nextIdentity) test.setIdentity(nextIdentity);
    const beforeEffects = find(test.render(patch, false), 'SelectorShell');
    assert.equal(beforeEffects.options.length, 0);
    assert.equal(beforeEffects.disabled, true);
    test.hooks.commit();
    assert.equal(test.calls[0].signal.aborted, true);
    assert.equal(test.calls.length, 2);
    await test.respond(1, [{ id: '2', label: '新选项' }]);
    assert.deepEqual(plain(find(test.render(), 'SelectorShell').options), [{ id: '2', label: '新选项' }]);
  });
}

await check('身份切换后旧分页结果被丢弃且不会继续请求下一页', async () => {
  const test = referenceFixture();
  test.render();
  test.setIdentity('tenant-b:user-b');
  test.render({ identity: 'tenant-b:user-b' });
  assert.equal(test.calls[0].signal.aborted, true);
  await test.respond(0, optionsPage(100), 200);
  assert.equal(test.calls.length, 2);
  assert.equal(find(test.render(), 'SelectorShell').options.length, 0);
  await test.respond(1, [{ id: '2', label: '本人租户选项' }]);
  assert.deepEqual(plain(find(test.render(), 'SelectorShell').options), [{ id: '2', label: '本人租户选项' }]);
});

await check('实际身份先变更时即使属性未更新也不能继续请求或写值', async () => {
  const test = referenceFixture();
  test.render();
  test.setIdentity('tenant-b:user-b');
  await test.respond(0, optionsPage(100), 200);
  const shell = find(test.render(), 'SelectorShell');
  assert.equal(test.calls.length, 1);
  assert.equal(shell.options.length, 0);
  assert.equal(shell.disabled, true);
  shell.onToggle('9007199254740993');
  assert.equal(test.changes.length, 0);
});

for (const [name, patch] of [
  ['锁定', { disabled: true }], ['只读', { field: { id: 'employee', type: 'EMPLOYEE', readonly: true } }],
  ['无资格', { enabled: false }], ['非参考字段', { field: { id: 'text', type: 'TEXT' } }],
  ['空流程', { definitionId: '' }], ['空字段', { field: { id: '', type: 'EMPLOYEE' } }],
]) {
  await check(`${name}状态不请求且无法改写`, () => {
    const test = referenceFixture(patch);
    const shell = find(test.render(), 'SelectorShell');
    assert.equal(test.calls.length, 0);
    assert.equal(shell.disabled, true);
    shell.onToggle('1');
    shell.onRemove('1');
    assert.equal(test.changes.length, 0);
  });
}

await check('进入锁定状态后旧交互回调同样失效', async () => {
  const test = referenceFixture({ value: '1' });
  test.render();
  await test.respond(0, [{ id: '1', label: '选中员工' }]);
  const stale = find(test.render(), 'SelectorShell');
  test.render({ disabled: true });
  stale.onToggle('1');
  stale.onRemove('1');
  assert.equal(test.changes.length, 0);
  assert.equal(test.calls[0].signal.aborted, true);
});

await check('取消资格时终止在途请求并立即清理旧选择', async () => {
  const test = referenceFixture();
  test.render();
  test.render({ enabled: false });
  assert.equal(test.calls[0].signal.aborted, true);
  await test.respond(0, optionsPage(100), 200);
  assert.equal(test.calls.length, 1);
  assert.equal(find(test.render(), 'SelectorShell').options.length, 0);
});

await check('选择器卸载后旧交互无法绕过只读切换', async () => {
  const test = referenceFixture({ value: '1' });
  test.render();
  await test.respond(0, [{ id: '1', label: '原员工' }]);
  const stale = find(test.render(), 'SelectorShell');
  test.hooks.unmount();
  stale.onToggle('1');
  stale.onRemove('1');
  assert.equal(test.changes.length, 0);
});

await check('卸载终止请求且晚到响应不更新状态，重新挂载不复用资料', async () => {
  const test = referenceFixture();
  test.render();
  test.hooks.unmount();
  assert.equal(test.calls[0].signal.aborted, true);
  await test.respond(0, optionsPage(100), 200);
  assert.equal(test.calls.length, 1);
  assert.equal(test.hooks.lateWrites(), 0);
  test.hooks.remount();
  assert.equal(find(test.render(), 'SelectorShell').options.length, 0);
  assert.equal(test.calls.length, 2);
});

await check('职位保留公共选项并按当前部门字符串编号过滤且不重取或改写', async () => {
  const departmentA = '9007199254740993';
  const departmentB = '9007199254740992';
  const test = referenceFixture({ field: { id: 'position', type: 'POSITION', filterByDeptFieldId: 'department' }, data: { department: departmentA } });
  test.render();
  await test.respond(0, [
    { id: '10', label: '甲部门职位', departmentId: departmentA },
    { id: '20', label: '乙部门职位', departmentId: departmentB },
    { id: '30', label: '未指定部门职位', departmentId: null },
  ]);
  let shell = find(test.render(), 'SelectorShell');
  assert.deepEqual(plain(shell.options), [{ id: '10', label: '甲部门职位' }, { id: '30', label: '未指定部门职位' }]);
  shell.onToggle('20');
  assert.equal(test.changes.length, 0);
  shell.onToggle('10');
  assert.deepEqual(plain(test.changes), [{ id: '10', label: '甲部门职位' }]);
  const stale = shell;
  shell = find(test.render({ data: { department: departmentB }, value: '10' }), 'SelectorShell');
  assert.deepEqual(plain(shell.options), [{ id: '20', label: '乙部门职位' }, { id: '30', label: '未指定部门职位' }, { id: '10', label: '甲部门职位', disabled: true }]);
  stale.onToggle('10');
  assert.equal(test.changes.length, 1);
  assert.equal(test.calls.length, 1);
  shell = find(test.render({ data: { department: '' }, value: '' }), 'SelectorShell');
  assert.equal(shell.options.length, 3);
  assert.equal(test.changes.length, 1);
});

await check('后续分页失败不暴露半份选项或错误正文，重试从第一页开始', async () => {
  const test = referenceFixture();
  test.render();
  await test.respond(0, optionsPage(100), 101);
  test.calls[1].reject(new Error('接口中的私密正文'));
  await settle();
  let tree = test.render();
  const shell = find(tree, 'SelectorShell');
  assert.equal(shell.options.length, 0);
  assert.equal(shell.disabled, true);
  assert.ok(!JSON.stringify(tree).includes('接口中的私密正文'));
  assert.equal(elements(tree).filter((element) => element.props?.role === 'alert').length, 1);
  find(tree, 'Button').onClick();
  tree = test.render();
  assert.equal(test.calls[1].signal.aborted, true);
  assert.equal(test.calls[2].params.pageNum, 1);
  assert.equal(find(tree, 'SelectorShell').loading, true);
  await test.respond(2, [{ id: '1', label: '恢复可用选项' }]);
  assert.equal(find(test.render(), 'SelectorShell').options.length, 1);
});

for (const [name, rows, total, extra] of [
  ['数字编号', [{ id: 9007199254740992, label: '员工' }], 1],
  ['空编号', [{ id: '', label: '员工' }], 1],
  ['数字部门编号', [{ id: '1', label: '职位', departmentId: 2 }], 1],
  ['缺少名称', [{ id: '1' }], 1],
  ['错误页码', [], 0, { pageNum: 2 }],
  ['错误分页大小', [], 0, { pageSize: 999 }],
  ['无穷总数', [], Infinity],
  ['超出安全范围总数', [], Number.MAX_SAFE_INTEGER + 1],
  ['非数组记录', {}, 1],
  ['中断分页', [], 200],
  ['末页缺失记录', [], 1],
]) {
  await check(`${name}响应停止读取且保留原表单`, async () => {
    const test = referenceFixture();
    test.render();
    await test.respond(0, rows, total, extra);
    const tree = test.render();
    assert.equal(find(tree, 'SelectorShell').options.length, 0);
    assert.equal(find(tree, 'SelectorShell').loading, false);
    assert.equal(find(tree, 'SelectorShell').disabled, true);
    assert.equal(elements(tree).filter((element) => element.props?.role === 'alert').length, 1);
    assert.equal(test.calls.length, 1);
    assert.equal(test.changes.length, 0);
  });
}

await check('无权限响应不会回退管理接口', async () => {
  const test = referenceFixture();
  test.render();
  test.calls[0].reject(new draftTypes.WorkflowDraftError('PERMISSION_DENIED'));
  await settle();
  const tree = test.render();
  assert.equal(find(tree, 'SelectorShell').disabled, true);
  assert.equal(test.calls.length, 1);
  assert.equal(test.changes.length, 0);
});

await check('独立及旧受控变更模式继续保持整体字段值', () => {
  const test = rendererFixture();
  let reference;
  const props = { formDef: { ...form, fields: [form.fields[5]] }, renderReferenceField: (value) => { reference = value; return null; } };
  test.render(props);
  reference.onChange({ id: '9007199254740993', label: '员工姓名' });
  test.render(props);
  assert.deepEqual(plain(test.ref.current.getData()), { employee: '9007199254740993' });
  const changes = [];
  test.render({ ...props, data: { employee: '1' }, onChange: (id, value) => changes.push([id, value]) });
  reference.onChange({ id: '2', label: '另一员工' });
  assert.deepEqual(changes, [['employee', '2']]);
});

await check('草稿编辑器仅在匹配的可读上下文接入参考组件', () => {
  const hooks = reactHarness();
  const changed = [];
  const context = { definitionId: 'definition-a', contextHash: 'context-a', formDefinition: form, fieldPermissions: [], assigneeNodes: [] };
  const draft = { state: { phase: 'ready', context, content: { title: '', formData, nodeAssignees: {} } }, hasUnsavedChanges: false, change: (patch) => changed.push(patch) };
  const module = loadSource('components/workflow/drafts/WorkflowDraftEditor.tsx', {
    react: hooks.react, 'lucide-react': controls, '@/components/common': controls,
    'react-router-dom': { useBlocker: () => ({ state: 'unblocked' }) },
    '@/components/common/SelectorShell': { SelectorShell: 'SelectorShell' },
    '@/components/common/selectorCache': { invalidateSelectorCache: () => undefined },
    '@/components/FormRenderer': { FormRenderer: 'FormRenderer' },
    '@/hooks/useWorkflowDraft': { useWorkflowDraft: () => draft, workflowDraftIdentity: () => 'tenant-a:user-a' },
    '@/utils/authStorage': { getCurrentUserSnapshot: () => ({}) }, '@/services/api/workflow/draftTypes': draftTypes,
    './WorkflowDraftReferenceField': { WorkflowDraftReferenceField: 'WorkflowDraftReferenceField' },
  });
  const props = { identity: 'tenant-a:user-a', definitionId: 'definition-a', definitionName: '流程', access: { view: true, save: true, submit: true, remove: true } };
  const render = (patch = {}) => find(hooks.draw(() => module.WorkflowDraftEditor({ ...props, ...patch })), 'FormRenderer');
  const reference = { field: form.fields[5], value: formData.employee, data: formData, disabled: false, onChange: () => undefined };
  const renderer = render();
  const field = renderer.renderReferenceField(reference);
  assert.equal(field.type, 'WorkflowDraftReferenceField');
  assert.equal(field.props.enabled, true);
  assert.equal(field.props.identity, props.identity);
  assert.equal(field.props.definitionId, props.definitionId);
  assert.equal(field.props.contextHash, context.contextHash);
  assert.equal(field.props.onChange, reference.onChange);
  assert.equal(render({ definitionId: 'definition-b' }).renderReferenceField(reference).props.enabled, false);
  assert.equal(render({ access: { ...props.access, view: false } }).renderReferenceField(reference).props.enabled, true);
  assert.equal(render({ access: { ...props.access, save: false } }).renderReferenceField(reference).props.enabled, true);
  assert.equal(render({ access: { ...props.access, view: false, save: false } }).renderReferenceField(reference).props.enabled, false);
  renderer.onDataChange(formData);
  assert.deepEqual(plain(changed), [{ formData }]);
});

console.log(`草稿参考选项检查：${passed}/${passed} 通过`);
