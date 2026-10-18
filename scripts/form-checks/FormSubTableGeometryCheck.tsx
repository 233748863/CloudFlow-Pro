import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormRenderer } from '@/components/FormRenderer';
import type { FormDefinition } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const query = new URLSearchParams(location.search);
const count = Number(query.get('rows') || 100);
const content = query.get('content') || 'long';
if (![3, 31, 100].includes(count) || !['long', 'short'].includes(content)) throw new Error('Unsupported geometry fixture');
const long = content === 'long';
const definition: FormDefinition = { id: 'c2-geometry', name: '列内容检查', fields: [{ id: 'items', type: 'SUB_TABLE', label: '列内容明细', maxRows: 100,
  columns: [{ id: 'name', type: 'TEXT', label: long ? 'ColumnName'.repeat(20) : '费用名称', width: 120 },
    { id: 'details', type: 'TEXT', label: '完整说明', width: 800, readonly: true },
    { id: 'employee', type: 'EMPLOYEE', label: '员工', width: 120, readonly: true },
    { id: 'file', type: 'UPLOAD_FILE', label: '附件', width: 120, maxCount: 1, readonly: true }] }] };
const initial = { items: Array.from({ length: count }, (_, index) => ({ _rowId: 'geometry-' + index, name: '费用' + (index + 1),
  details: long ? '完整保留的明细说明。'.repeat(index % 3 === 0 ? 35 : 5) : '说明',
  employee: long ? '姓名'.repeat(index % 3 === 0 ? 30 : 5) : '员工', file: long ? ['attachment'.repeat(20)] : [] })) };
const App = () => {
  const [data, setData] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const show = (index: number) => setErrors({ [`items[${index}].name`]: '请完整核对此项费用的填写内容。'.repeat(4) + 'ValidationDetail'.repeat(6) });
  return <main className="p-3 pt-16"><div className="fixed top-0 left-0 z-50 flex gap-4 bg-white p-3 text-black">
    <button onClick={() => show(count - 1)}>定位末行错误</button><button onClick={() => show(0)}>定位首行错误</button><button onClick={() => setErrors({})}>清除错误</button>
  </div><h1>列内容检查</h1><FormRenderer formDef={definition} data={data} onDataChange={setData} fieldErrors={errors} hideActions />
    <output className="sr-only" data-testid="values">{JSON.stringify(data)}</output></main>;
};
createRoot(document.getElementById('root')!).render(<App />);
