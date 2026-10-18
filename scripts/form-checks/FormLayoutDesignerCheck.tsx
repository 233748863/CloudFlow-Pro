import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { FormRenderer } from '@/components/FormRenderer';
import { FormBuilder } from '@/components/FormBuilder';
import type { FormDefinition, FormField } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const text = (id: string, label = id): FormField => ({ id, label, type: 'TEXT', defaultValue: `${id}-default` });
const grid = (columns: number): FormField => ({ id: `grid${columns}`, type: 'GRID', label: `${columns}列标签`, title: `${columns}列标题`, columns,
  children: Array.from({ length: columns }, (_, index) => text(`grid${columns}_${index}`)) });
const layouts: FormField[] = [
  { id: 'group', type: 'GROUP', label: '分组标签', title: '分组标题', children: [text('group_text')] },
  grid(2), grid(3), grid(4),
  { id: 'tabs', type: 'TABS', label: '标签页名称', title: '标签页标题', children: [
    { id: 'first_tab', type: 'GROUP', label: '第一页名称', title: '第一页标题', children: [text('first_text')] },
    { id: 'second_tab', type: 'GROUP', label: '第二页名称', title: '第二页标题', children: [text('second_text')] },
  ] },
  { id: 'collapsed', type: 'COLLAPSE', label: '折叠名称', title: '折叠标题', defaultExpanded: false, children: [text('collapsed_text')] },
];
const deep: FormField = { id: 'deep1', type: 'GROUP', label: '第1层', children: [
  { id: 'deep2', type: 'GROUP', label: '第2层', children: [
    { id: 'deep3', type: 'GROUP', label: '第3层', children: [text('deep_text', '三层内字段')] },
  ] },
] };
const designer: FormField[] = [text('loose', '待移动字段'),
  { id: 'source', type: 'GROUP', label: '来源容器', children: [text('alpha', '字段甲'), text('beta', '字段乙')] },
  { id: 'destination', type: 'GROUP', label: '目标容器', children: [text('gamma', '字段丙')] }, deep, grid(4)];
const scenario = new URLSearchParams(location.search).get('scenario') || 'render';
const initial: FormDefinition = { id: 'component-layout-check', name: '布局与设计器组件验证', fields: scenario === 'designer' ? designer : layouts };
const Check = () => {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(initial);
  const [generation, setGeneration] = useState(0);
  return <MemoryRouter><Toaster /><main className="mx-auto max-w-[1600px] p-4">
    <h1>布局与设计器组件验证</h1>
    {scenario === 'designer' ? <>
      <button type="button" onClick={() => setGeneration((value) => value + 1)}>重载组件已保存定义</button>
      <output data-testid="saved-definition" className="sr-only">{JSON.stringify(saved)}</output>
      <FormBuilder key={generation} initialForm={saved} onSave={(form) => setSaved(form)} />
    </> : <><FormRenderer formDef={initial} data={data} onDataChange={setData} hideActions />
      <output data-testid="entered-values" className="sr-only">{JSON.stringify(data)}</output></>}
  </main></MemoryRouter>;
};
createRoot(document.getElementById('root')!).render(<Check />);
