import React, { Profiler, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormFieldTree } from '@/components/form-renderer/FormFieldTree';
import type { FormReferenceFieldRenderProps } from '@/components/form-renderer/types';
import type { FormField } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const observations = { commits: 0, referenceRenders: 0 };
Object.assign(window, { treeRenderObservations: observations });
const fields: FormField[] = [{ id: 'collapse', type: 'COLLAPSE', label: '切换分组', defaultExpanded: true,
  children: [{ id: 'group', type: 'GROUP', label: '嵌套分组', children: [
    { id: 'person', type: 'EMPLOYEE', label: '人员' },
    { id: 'other', type: 'EMPLOYEE', label: '另一人员' },
  ] }] }];
const noErrors = {};
const reference = ({ controlProps, field, value, data, disabled, onChange }: FormReferenceFieldRenderProps) => {
  observations.referenceRenders++;
  return <input {...controlProps} value={String(value || '')} disabled={disabled} data-peer-value={String(data.other || '')}
    onChange={event => onChange({ id: event.target.value, label: `${field.label}:${event.target.value}` })} />;
};
const App = () => {
  const [data, setData] = useState<Record<string, unknown>>({ person: '甲', other: '乙' });
  const onChange = useCallback((field: FormField, value: unknown, extra?: Record<string, unknown>) => {
    setData(previous => ({ ...previous, [field.id]: value, ...extra }));
  }, []);
  return <main className="p-4"><Profiler id="tree" onRender={() => { observations.commits++; }}>
    <FormFieldTree fields={fields} data={data} disabled={false} readonly={false} errors={noErrors} errorFocusRequest={0}
      renderReferenceField={reference} onChange={onChange} />
  </Profiler><output data-testid="values">{JSON.stringify(data)}</output></main>;
};
createRoot(document.getElementById('root')!).render(<App />);
