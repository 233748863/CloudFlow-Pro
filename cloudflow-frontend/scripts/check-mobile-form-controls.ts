import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';

// 执行正式表单树及内置控件；hooks、字典和外层控件使用替身，不代表浏览器验收。
type Element = React.ReactElement<Record<string, any>>;
let slots: any[] = [];
let cursor = 0;
const react = { ...React, memo: (component: unknown) => component,
  useId: () => 'options-test', useRef: (value: unknown) => ({ current: value }),
  useMemo: (body: () => unknown) => body(), useEffect: () => {},
  useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
};
const placeholder = (name: string) => name;
const dependencies: Record<string, any> = {
  react: { ...react, default: react, __esModule: true },
  '@/utils/cn': { cn: (...values: unknown[]) => values.filter(value => typeof value === 'string').join(' ') },
  '@/components/common': new Proxy({}, { get: (_, name) => placeholder(String(name)) }),
  '@/components/common/DateRangePicker': { DateRangePicker: placeholder('DateRangePicker') },
  '@/components/common/SelectorShell': { SelectorShell: placeholder('SelectorShell') },
  '@/hooks/useDict': { useDict: () => ({ data: [], isError: false, isFetching: false }) },
  '@/utils/formFieldRuntime': { getFieldDisplayValue: (_: unknown, __: unknown, value: unknown) => value },
  '@/utils/amountValue': {}, '@/utils/formValueRuntime': { formHasValue: (value: unknown) => value !== null && value !== undefined,
    formDeclaredFields: () => new Set(), formDerivedFields: () => new Set(), formExpressionData: (_: unknown, data: unknown) => data,
    formFieldState: (field: any, _: unknown, __: unknown, ___: unknown, options: any) => ({ visible: !field.hidden, readonly: options.readonly || field.readonly, required: field.required }) },
  '@/utils/formTree': { isLayoutField: (field: any) => ['GRID', 'TABS', 'GROUP', 'COLLAPSE'].includes(field.type) },
  '@/utils/formErrorFocus': {}, './FormRichText': { renderFormMarkdown: (value: string) => value },
  './FormSubTable': { FormSubTable: placeholder('FormSubTable') },
};
function load(path: string) {
  const compiled = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (name: string) => {
    assert.ok(name in dependencies, `未提供依赖：${name}`); return dependencies[name]; }, console });
  return compiled.exports;
}
const { BuiltinFieldControl } = load('../src/components/form-renderer/BuiltinFieldControl.tsx');
dependencies['./FormScalarControl'] = { FormScalarControl: BuiltinFieldControl };
const { FormFieldTree } = load('../src/components/form-renderer/FormFieldTree.tsx');
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  if (typeof element.type === 'function') return nodes((element.type as (props: any) => unknown)(element.props));
  return [element, ...nodes(element.props.children)];
}
const option = { id: 'choice', type: 'CHECKBOX_GROUP', label: '选择', options: ['甲', '乙'] };
const fieldProps = { field: option, fieldPath: 'choice', inputId: 'input-choice', labelId: 'label-choice', errorId: 'error-choice',
  value: ['甲'], data: {}, disabled: false, readonly: false, onChange: (_: unknown) => {} };
const renderField = (extra: Record<string, unknown> = {}) => { cursor = 0; return nodes(BuiltinFieldControl({ ...fieldProps, ...extra })); };
let checks = 0;
function check(label: string, body: () => void) { slots = []; body(); checks++; console.log(`PASS ${label}`); }
check('手机单选复选的完整标签为44px目标，自动模式宽屏恢复，显式桌面保持', () => {
  for (const type of ['RADIO_GROUP', 'CHECKBOX_GROUP']) for (const layoutMode of ['mobile', 'auto', 'desktop']) {
    const labels = renderField({ field: { ...option, type }, layoutMode }).filter(node => node.type === 'label');
    assert.equal(labels.length, 2);
    for (const label of labels) {
      assert.equal(label.props.className.includes('min-h-11 min-w-11'), layoutMode !== 'desktop');
      assert.equal(label.props.className.includes('sm:min-h-0 sm:min-w-0'), layoutMode === 'auto');
      assert.ok(nodes(label).some(node => node.type === 'input'));
    }
  }
});
check('单选替换、复选增删、禁用状态和错误关联保持', () => {
  let changed: any;
  const controls = renderField({ invalid: true, onChange: (value: unknown) => { changed = value; } }).filter(node => node.type === 'input');
  controls[0].props.onChange(); assert.deepEqual(Array.from(changed), []);
  controls[1].props.onChange(); assert.deepEqual(Array.from(changed), ['甲', '乙']);
  assert.equal(controls[0].props['aria-describedby'], 'error-choice'); assert.equal(controls[0].props['aria-invalid'], true);
  renderField({ field: { ...option, type: 'RADIO_GROUP' }, onChange: (value: unknown) => { changed = value; } }).find(node => node.type === 'input')!.props.onChange();
  assert.equal(changed, '甲');
  assert.ok(renderField({ disabled: true }).filter(node => node.type === 'input').every(node => node.props.disabled));
});
const fields = [{ id: 'tabs', type: 'TABS', label: '审批内容', children: [
  { id: 'first', type: 'GRID', label: '第一项', columns: 2, children: [option] },
  { id: 'second', type: 'GRID', label: '第二项', children: [{ ...option, id: 'other' }] },
] }];
function renderTree(extra: Record<string, unknown> = {}) { cursor = 0; return nodes(FormFieldTree({ fields, data: { choice: ['甲'] },
  disabled: false, readonly: false, errors: {}, errorFocusRequest: 0, onChange: () => {}, ...extra })); }
check('正式表单树传播手机布局并支持横滚页签及切换', () => {
  const tree = renderTree({ layoutMode: 'mobile' });
  const tabs = tree.filter(node => node.props.role === 'tab');
  assert.equal(tabs.length, 2); assert.ok(tabs.every(node => node.props.className.includes('min-h-11 min-w-11')));
  assert.ok(tree.find(node => node.props.role === 'tablist')!.props.className.includes('overflow-x-auto'));
  assert.ok(tree.find(node => node.props.role === 'tablist')!.props.className.includes('gap-2'));
  assert.ok(tree.filter(node => node.type === 'label' && !node.props.htmlFor).every(node => node.props.className.includes('min-h-11 min-w-11')));
  tabs[1].props.onClick();
  const next = renderTree({ layoutMode: 'mobile' });
  assert.equal(next.find(node => node.props.role === 'tabpanel')!.props.id, 'panel-tabs-second');
  assert.equal(next.find(node => node.props.id === 'tab-tabs-second')!.props['aria-selected'], true);
});
check('桌面页签原尺寸、自动响应式及表单只读代表流程保持', () => {
  let tree = renderTree({ layoutMode: 'desktop' });
  assert.ok(tree.filter(node => node.props.role === 'tab').every(node => !node.props.className.includes('min-h-11')));
  assert.ok(tree.some(node => node.props.className?.includes('grid-cols-2')));
  tree = renderTree({ layoutMode: 'auto' });
  assert.ok(tree.filter(node => node.props.role === 'tab').every(node => node.props.className.includes('sm:min-h-0 sm:min-w-0')));
  tree = renderTree({ layoutMode: 'mobile', readonly: true });
  assert.equal(tree.some(node => node.type === 'input'), false);
  assert.ok(tree.some(node => node.props.children === '甲'));
});
console.log(`通过 ${checks} 组手机表单基本检查；未执行浏览器、HTTP或全量回归。`);
