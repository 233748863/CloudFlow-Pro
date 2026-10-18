import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormRenderer } from '@/components/FormRenderer';
import type { FormDefinition } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'standard';
const count = scenario === 'empty' ? 0 : scenario === 'virtual' ? 31 : 3;
const definition: FormDefinition = { id: 'c2-mobile-' + scenario, name: '费用明细', fields: [{ id: 'items', type: 'SUB_TABLE', label: '费用明细',
  minRows: scenario === 'limits' ? 3 : 0, maxRows: scenario === 'limits' ? 3 : 100,
  allowAdd: scenario !== 'locked', allowDelete: scenario !== 'locked', allowSort: scenario !== 'locked', allowCopyRow: scenario !== 'locked',
  columns: [{ id: 'name', type: 'TEXT', label: '费用说明', defaultValue: '新增费用' }, { id: 'amount', type: 'AMOUNT', label: '费用金额', precision: 2, defaultValue: '0.10' }],
  summaryColumns: [{ columnId: 'amount', aggregation: 'SUM' }], emptyText: '暂无费用明细' }] };
const initial = { items: Array.from({ length: count }, (_, index) => ({ _rowId: 'row-' + index, name: '费用' + (index + 1), amount: index % 2 ? '0.20' : '0.10' })) };
const App = () => {
  const [data, setData] = useState<Record<string, unknown>>(initial);
  return <main className="mx-auto max-w-xl p-3"><h1>手机费用明细</h1><FormRenderer formDef={definition} data={data} onDataChange={setData} readonly={scenario === 'readonly'} hideActions />
    <output className="sr-only" data-testid="values">{JSON.stringify(data)}</output></main>;
};
createRoot(document.getElementById('root')!).render(<App />);
