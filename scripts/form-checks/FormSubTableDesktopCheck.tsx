import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FormRenderer } from '@/components/FormRenderer';
import type { FormDefinition } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const count = Number(new URLSearchParams(location.search).get('rows') || 3);
if (![0, 3, 30, 31, 100].includes(count)) throw new Error('Unsupported table fixture');
const definition: FormDefinition = { id: 'c2-desktop', name: '费用明细', fields: [{ id: 'items', type: 'SUB_TABLE', label: '费用明细', maxRows: 100,
  columns: [{ id: 'name', type: 'TEXT', label: '费用说明', required: true }, { id: 'amount', type: 'AMOUNT', label: '费用金额', precision: 2, defaultValue: '0.10' },
    ...Array.from({ length: 6 }, (_, index) => ({ id: 'extra' + index, type: 'TEXT' as const, label: '补充说明' + (index + 1) }))],
  summaryColumns: [{ columnId: 'amount', aggregation: 'SUM' }], emptyText: '暂无费用明细' }] };
const initial = { items: Array.from({ length: count }, (_, index) => ({ _rowId: 'row-' + index, name: '费用' + (index + 1), amount: '0.10' })) };
const App = () => {
  const [data, setData] = useState<Record<string, unknown>>(initial);
  return <main className="p-3"><h1>电脑费用明细</h1><FormRenderer formDef={definition} data={data} onDataChange={setData} hideActions />
    <output className="sr-only" data-testid="values">{JSON.stringify(data)}</output></main>;
};
const start = performance.now();
flushSync(() => createRoot(document.getElementById('root')!).render(<App />));
document.documentElement.dataset.tableMountMs = String(performance.now() - start);
