import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FormRenderer, type FormRendererHandle } from '@/components/FormRenderer';
import type { FormDefinition, FormField } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'external';
const field = (id: string, required = false): FormField => ({ id, type: 'TEXT', label: id, required });
const fillers: FormField[] = Array.from({ length: 32 }, (_, index) => ({ id: `filler_${index}`, type: 'TEXTAREA', rows: 3, label: `说明 ${index + 1}` }));
const lines: FormField = { id: 'lines', type: 'SUB_TABLE', label: '明细', columns: [{ ...field('name', true), label: '明细名称' }] };
const first = field('first', scenario === 'priority' || scenario === 'correction');
let fields: FormField[] = [first, ...fillers, field('last', scenario === 'correction')];
if (scenario === 'priority') fields.push(lines);
if (scenario === 'collapse') fields = [first, ...fillers, { id: 'collapsed', type: 'COLLAPSE', label: '折叠信息', defaultExpanded: false, children: [field('last', true)] }];
if (scenario === 'tabs') fields = [first, ...fillers, { id: 'tabs', type: 'TABS', label: '分组', children: [
  { id: 'overview', type: 'GROUP', label: '概览', children: [field('overview_text')] },
  { id: 'detail', type: 'GROUP', label: '详细', children: [field('last', true)] },
] }];
if (['virtual', 'virtual-edit'].includes(scenario)) fields = [first, ...fillers, { id: 'collapsed', type: 'COLLAPSE', label: '折叠信息', defaultExpanded: false, children: [
  { id: 'tabs', type: 'TABS', label: '分组', children: [
    { id: 'overview', type: 'GROUP', label: '概览', children: [field('overview_text')] },
    { id: 'detail', type: 'GROUP', label: '详细', children: [lines] },
  ] },
] }];
if (scenario === 'hidden') fields = [{ ...field('hidden'), visibleExpr: 'false' }, first, ...fillers, field('last')];
const definition: FormDefinition = { id: `c1-location-${scenario}`, name: '字段错误定位验证', fields };
const initial = { lines: Array.from({ length: ['virtual', 'virtual-edit'].includes(scenario) ? 100 : 1 }, (_, index) => ({ _rowId: `owned-${index}`, name: scenario === 'priority' || index === 87 ? '' : `明细 ${index + 1}` })) };
const Check = () => {
  const renderer = useRef<FormRendererHandle>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [data, setData] = useState<Record<string, unknown>>(initial);
  const [validation, setValidation] = useState(0);
  const show = () => setErrors(scenario === 'order' ? { last: '请核对最后一项', first: '请核对第一项' }
    : scenario === 'hidden' ? { unknown: '未声明错误', hidden: '隐藏字段错误', last: '请核对最后一项' }
      : scenario === 'virtual' ? { 'lines[87].name': '请核对第88行' } : { last: '请核对最后一项' });
  return <MemoryRouter><main className="mx-auto max-w-4xl p-4 pt-20">
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center gap-4 bg-white p-3 text-black">
      <button type="button" onClick={show}>显示服务端错误</button>
      <button type="button" onClick={() => { renderer.current?.validate(); setValidation((value) => value + 1); }}>执行填写校验</button>
    </div>
    <h1>字段错误定位验证</h1><output data-testid="validation-count">{validation}</output>
    <FormRenderer ref={renderer} formDef={definition} data={data} onDataChange={setData} fieldErrors={errors} hideActions />
  </main></MemoryRouter>;
};
createRoot(document.getElementById('root')!).render(<Check />);
