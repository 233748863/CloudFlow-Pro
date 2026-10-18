import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormRenderer } from '@/components/FormRenderer';
import type { FormDefinition } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const parameters = new URLSearchParams(location.search);
const count = Number(parameters.get('rows'));
const device = parameters.get('device');
if (![3, 100].includes(count) || !['desktop', 'mobile'].includes(device || '')) throw new Error('Unsupported render fixture');
const definition: FormDefinition = { id: 'c2-row-renders', name: '行刷新检查', fields: [
  { id: 'gate', type: 'TEXT', label: '主表条件' },
  { id: 'items', type: 'SUB_TABLE', label: '费用明细', minRows: 0, maxRows: 500,
    columns: [
      { id: 'name', type: 'TEXT', label: '费用说明' },
      { id: 'amount', type: 'AMOUNT', label: '费用金额', precision: 2 },
      { id: 'conditional', type: 'TEXT', label: '条件说明', visibleExpr: "${gate} == 'open'" },
      { id: 'locked', type: 'TEXT', label: '条件编辑', disabledExpr: "${gate} == 'closed'" },
      ...Array.from({ length: 4 }, (_, index) => ({ id: 'extra' + index, type: 'TEXT' as const, label: '补充' + index })),
    ], summaryColumns: [{ columnId: 'amount', aggregation: 'SUM' }] },
] };
const initial = { gate: 'open', items: Array.from({ length: count }, (_, index) => ({
  _rowId: 'row-' + index, name: '费用' + index, amount: '0.10', conditional: '条件' + index, locked: '编辑' + index,
})) };

const App = () => {
  const [data, setData] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return <main className="p-3"><h1>行刷新检查</h1>
    <nav className="flex flex-wrap gap-2">
      <button onClick={() => setErrors({ 'items[0].name': '首行说明错误' })}>首行错误</button>
      <button onClick={() => setErrors({ 'items[1].amount': '次行金额错误' })}>次行错误</button>
      <button onClick={() => setErrors({ gate: '主表错误' })}>主表错误</button>
      <button onClick={() => setErrors({})}>清除错误</button>
    </nav>
    <FormRenderer formDef={definition} data={data} onDataChange={setData} fieldErrors={errors}
      layoutMode={device === 'mobile' ? 'mobile' : 'desktop'} hideActions />
    <output className="sr-only" data-testid="values">{JSON.stringify(data)}</output>
  </main>;
};
createRoot(document.getElementById('root')!).render(<App />);
