import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FormRenderer, type FormRendererHandle } from '@/components/FormRenderer';
import type { FormDefinition, FormField } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'defaults';
const fields: FormField[] = [
  { id: 'text', label: '文字', type: 'TEXT', required: false, defaultValue: '文字默认值' },
  { id: 'number', label: '数字', type: 'NUMBER', required: false, defaultValue: 1234.5 },
  { id: 'date', label: '日期', type: 'DATE', required: false, defaultValue: '2026-10-05' },
  { id: 'select', label: '选择', type: 'SELECT', required: false, options: ['甲', '乙'], defaultValue: '乙' },
  { id: 'textarea', label: '说明', type: 'TEXTAREA', required: false, defaultValue: '第一行\n第二行' },
  ...(['EMPLOYEE', 'DEPT', 'POST', 'POSITION'] as const).map((type, index): FormField => ({
    id: type.toLowerCase(), label: type, type, required: false, readonly: true, defaultValue: String(100 + index), displayFieldId: type.toLowerCase() + '_name',
  })),
];
const names = Object.fromEntries(['employee', 'dept', 'post', 'position'].map(id => [id + '_name', id + '历史名称']));
const initial: FormDefinition = { id: 'original-fields-component', version: 1, name: '原字段组件验证', fields: scenario === 'precision'
  ? fields.map(field => field.id === 'number' ? { ...field, precision: 3, defaultValue: '9007199254740993.125' } : field) : fields };
const Check = () => {
  const renderer = useRef<FormRendererHandle>(null);
  const [definition, setDefinition] = useState(initial);
  const [readonly, setReadonly] = useState(scenario !== 'defaults' && scenario !== 'empty');
  const [data, setData] = useState<Record<string, unknown>>(scenario === 'fallback' ? {} : scenario === 'empty'
    ? { ...names, text: '', number: 0, date: null, select: '', textarea: '' } : names);
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>({});
  return <MemoryRouter><main className="mx-auto max-w-5xl space-y-4 p-4">
    <h1>原字段默认值与只读组件验证</h1>
    <button type="button" onClick={() => setReadonly(value => !value)}>切换只读</button>
    <button type="button" onClick={() => setSnapshot(renderer.current?.getData() || {})}>检查当前值</button>
    <button type="button" onClick={() => { setData(names); setDefinition({ ...initial, version: 2, fields: fields.map(field => field.id === 'text' ? { ...field, defaultValue: '新版默认值' } : field) }); }}>切换新版本</button>
    <FormRenderer ref={renderer} formDef={definition} data={data} onDataChange={setData} readonly={readonly} hideActions />
    <output data-testid="current-values" className="sr-only">{JSON.stringify(snapshot)}</output>
  </main></MemoryRouter>;
};
createRoot(document.getElementById('root')!).render(<Check />);
