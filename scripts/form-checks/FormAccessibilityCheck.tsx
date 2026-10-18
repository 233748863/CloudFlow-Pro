import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FormRenderer, type FormRendererHandle } from '@/components/FormRenderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getCachedOrFetch } from '@/components/common/selectorCache';
import { WorkflowFormAttachment } from '@/components/workflow/WorkflowFormAttachment';
import { WorkflowDraftReferenceField } from '@/components/workflow/drafts/WorkflowDraftReferenceField';
import type { FormDefinition, FormField, FormFieldType } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

// Local option fixtures exercise real controls without business HTTP or persisted identities.
const options: Record<string, unknown[]> = {
  'employees:active': [{ id: 101, name: '样本员工' }], 'dept:tree': [{ deptId: 102, deptName: '样本部门', children: [] }],
  'post:list': [{ postId: 103, postName: '样本岗位' }], 'position:list': [{ id: 104, positionName: '样本职位' }],
  'sysUser:options': [{ id: '105', name: '样本用户' }],
};
await Promise.all(Object.entries(options).map(([key, value]) => getCachedOrFetch(key, async () => value)));
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
client.setQueryData(queryKeys.dict('c1-local'), [{ value: 'sample', label: '样本字典' }]);
const references: FormFieldType[] = ['EMPLOYEE', 'DEPT', 'POST', 'POSITION', 'USER_MULTI', 'DEPT_MULTI', 'DICT_SELECT'];
const types: FormFieldType[] = ['TEXT', 'TEXTAREA', 'NUMBER', 'AMOUNT', 'DATE', 'DATETIME', 'TIME', 'RICH_TEXT', 'SWITCH', 'SELECT', 'MULTI_SELECT', 'RADIO_GROUP', 'CHECKBOX_GROUP', 'DATE_RANGE', ...references, 'UPLOAD_FILE', 'UPLOAD_IMAGE'];
const fields: FormField[] = types.map((type) => ({ id: type.toLowerCase(), type, label: `字段 ${type}`, required: true,
  ...(type === 'DICT_SELECT' ? { dictType: 'c1-local' } : {}),
  ...(['SELECT', 'MULTI_SELECT', 'RADIO_GROUP', 'CHECKBOX_GROUP'].includes(type) ? { options: ['甲', '乙'] } : {}) }));
fields.push({ id: 'lines', type: 'SUB_TABLE', label: '明细', required: false, columns: [{ id: 'name', type: 'TEXT', label: '明细名称', required: true }] });
const definition: FormDefinition = { id: 'c1-accessibility', name: '字段错误关联验证', fields };
const errors = Object.fromEntries([...types.map((type) => [type.toLowerCase(), `请核对字段 ${type}`]), ['lines[0].name', '请填写第一行明细名称'], ['lines[1].name', '请填写第二行明细名称']]);
const draftDefinition: FormDefinition = { id: 'c1-draft-accessibility', name: '草稿引用错误关联', fields: references.map((type) => ({ id: `draft_${type.toLowerCase()}`, type, label: `草稿 ${type}`, required: true })) };
const draftErrors = Object.fromEntries(draftDefinition.fields.map((field) => [field.id, `请核对${field.label}`]));

const Check = () => {
  const renderer = useRef<FormRendererHandle>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [data, setData] = useState<Record<string, unknown>>({ lines: [{ _rowId: 'owned-row-1', name: '' }, { _rowId: 'owned-row-2', name: '' }] });
  const [valid, setValid] = useState<boolean>();
  return <QueryClientProvider client={client}><MemoryRouter><main className="mx-auto max-w-5xl space-y-4 p-4">
    <h1>字段错误关联验证</h1>
    <div className="flex gap-4"><button type="button" onClick={() => setFieldErrors(errors)}>显示字段错误</button>
      <button type="button" onClick={() => setFieldErrors({})}>清除字段错误</button>
      <button type="button" onClick={() => setValid(renderer.current?.validate())}>执行填写校验</button></div>
    <output data-testid="validation-result">{valid === undefined ? '尚未校验' : valid ? '校验通过' : '校验未通过'}</output>
    <output data-testid="form-values" className="sr-only">{JSON.stringify(data)}</output>
    <FormRenderer ref={renderer} formDef={definition} data={data} onDataChange={setData} fieldErrors={fieldErrors} hideActions
      renderUploadField={(props) => <WorkflowFormAttachment {...props} context={{ definitionId: 'c1-component-only' }} />} />
    <FormRenderer formDef={draftDefinition} fieldErrors={Object.keys(fieldErrors).length ? draftErrors : {}} hideActions
      renderReferenceField={(props) => <WorkflowDraftReferenceField {...props} identity="" definitionId="c1-component-only" contextHash="" enabled={false} />} />
  </main></MemoryRouter></QueryClientProvider>;
};
createRoot(document.getElementById('root')!).render(<Check />);
