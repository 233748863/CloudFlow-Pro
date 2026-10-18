import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { FormDesign } from '../../src/pages/FormDesign';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormBuilder } from '../../src/components/FormBuilder';
import { FieldPermissionDialog } from '../../src/components/workflow/FieldPermissionDialog';
import { useWorkflowFormAttachments } from '../../src/hooks/useWorkflowFormAttachments';
import { FormRenderer, type FormRendererHandle, type FormReferenceFieldRenderProps, type FormUploadFieldRenderProps } from '../../src/components/FormRenderer';
import type { FormScalarControlProps } from '../../src/components/form-renderer/BuiltinFieldControl';
import { FIELD_REGISTRY } from '../../src/components/form-builder/fieldRegistry';
import type { FormDefinition, FormField, FormFieldType } from '../../src/types';
import type { FieldPermission } from '../../src/types/workflowSemantic';
import '../../src/index.css';

interface Scenario {
  form: FormDefinition;
  data?: Record<string, unknown>;
  errors?: Record<string, string>;
  permissions?: FieldPermission[];
  layoutMode?: 'auto' | 'desktop' | 'mobile';
  builder?: boolean;
  matrix?: boolean;
  attachments?: boolean;
  versions?: boolean;
}

interface BrowserChecks {
  mount: (name: string) => void;
  data: () => Record<string, unknown>;
  validate: () => boolean;
  renders: Record<string, number>;
  saved?: FormDefinition;
  renderMs: number;
  ready: number;
}

declare global { interface Window { formBrowserChecks: BrowserChecks } }

const controls = FIELD_REGISTRY.TEXT.control;
FIELD_REGISTRY.TEXT.control = function CountedText(props: FormScalarControlProps) {
  const counts = window.formBrowserChecks.renders;
  counts[props.inputId] = (counts[props.inputId] || 0) + 1;
  return React.createElement(controls, props);
};

const field = (id: string, type: FormFieldType, overrides: Partial<FormField> = {}): FormField => ({ id, type, label: id, required: false, ...overrides });
const reference = ({ field: definition, value, fieldPath, disabled, onChange, onMultiChange }: FormReferenceFieldRenderProps) => <select
  id={`input-${fieldPath || definition.id}`} aria-label={definition.label} disabled={disabled} value={Array.isArray(value) ? value[0] || '' : String(value || '')}
  onChange={(event) => onMultiChange && ['USER_MULTI', 'DEPT_MULTI'].includes(definition.type) ? onMultiChange(event.target.value ? [{ id: event.target.value, label: '测试引用' }] : []) : onChange(event.target.value ? { id: event.target.value, label: '测试引用' } : null)}>
  <option value="">请选择</option><option value="101">测试引用</option>
</select>;
const upload = ({ field: definition, readonly, disabled }: FormUploadFieldRenderProps) => <button type="button" disabled={readonly || disabled} aria-label={definition.label}>附件测试入口</button>;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const table = (columns: number): FormField => field('items', 'SUB_TABLE', {
  label: '采购明细', maxRows: 120,
  columns: Array.from({ length: columns }, (_, index) => field(`column_${index}`, index === 1 ? 'AMOUNT' : 'TEXT', { label: `明细列${index + 1}`, required: true, precision: 2 })),
  summaryColumns: [{ columnId: 'column_1', aggregation: 'SUM' }],
});
const tableData = (count: number, columns: number) => ({ items: Array.from({ length: count }, (_, rowIndex) => ({ _rowId: `row-${rowIndex}`, ...Object.fromEntries(Array.from({ length: columns }, (_, columnIndex) => [`column_${columnIndex}`, columnIndex === 1 ? '0.10' : `行${rowIndex + 1}列${columnIndex + 1}`])) })) });

const scenarios = (name: string): Scenario => {
  if (name === 'versions') return { versions: true, form: { id: name, name, fields: [] } };
  if (name === 'unknown-version') return { form: { id: name, name, version: 2, versionUnknownFlag: true, fields: [field('historic', 'TEXT')] } };
  if (name === 'attachments') return { attachments: true, form: { id: name, name: '私有附件检查', fields: [field('evidence', 'UPLOAD_FILE', { label: '扫描件', maxCount: 2, maxSize: 1, accept: '.pdf' })] } };
  if (name === 'matrix') return { matrix: true, form: { id: name, name, fields: [] } };
  if (name === 'all') return { form: { id: name, name, fields: (Object.keys(FIELD_REGISTRY) as FormFieldType[]).map((type) => {
    const definition = field(`field_${type}`, type, { ...FIELD_REGISTRY[type].defaults, label: type, fillMappings: undefined, displayFieldId: undefined });
    if (type === 'GROUP' || type === 'GRID' || type === 'COLLAPSE') definition.children = [field(`nested_${type}`, 'TEXT')];
    if (type === 'TABS') definition.children = [field('tab_page', 'GROUP', { children: [field('tab_text', 'TEXT')] })];
    if (type === 'SUB_TABLE') { definition.columns = [field('item_text', 'TEXT')]; definition.minRows = 1; }
    if (type === 'DESCRIPTION' || type === 'RICH_TEXT') definition.defaultValue = '# 安全内容\n<img src=x onerror="window.formXssExecuted=true"><script>window.formXssExecuted=true</script>';
    if (type === 'DICT_SELECT') definition.dictType = 'fixture';
    return definition;
  }) } };
  if (name === 'fifty') return { form: { id: name, name, fields: Array.from({ length: 50 }, (_, index) => field(`text_${index}`, 'TEXT')) } };
  if (name === 'grid') return { layoutMode: 'mobile', form: { id: name, name, fields: [field('grid', 'GRID', { columns: 4, children: Array.from({ length: 4 }, (_, index) => field(`grid_${index}`, 'TEXT', { span: 2 })) })] } };
  if (name === 'table' || name === 'mobile-table' || name === 'virtual') return { form: { id: name, name, fields: [table(name === 'virtual' ? 8 : 2)] }, data: tableData(name === 'virtual' ? 100 : 3, name === 'virtual' ? 8 : 2), layoutMode: name === 'mobile-table' ? 'mobile' : 'desktop' };
  if (name === 'permissions') return { form: { id: name, name, fields: [field('visible', 'TEXT'), field('secret', 'TEXT'), field('locked', 'TEXT')] }, data: { visible: '可修改', secret: '机密', locked: '原值' }, permissions: [{ fieldId: 'secret', nodeKey: '__START__', visibleFlag: false, editableFlag: false }, { fieldId: 'locked', nodeKey: '__START__', visibleFlag: true, editableFlag: false }] };
  if (name === 'builder') return { builder: true, form: { id: name, name: '设计器验证', fields: [field('group_left', 'GROUP', { label: '左分组', children: [field('move_me', 'TEXT', { label: '待移动文本' }), field('keep_me', 'TEXT', { label: '保留文本' })] }), field('group_right', 'GROUP', { label: '右分组', children: [] })] } };
  return { form: { id: name, name, fields: [field('money', 'AMOUNT', { label: '精确金额', precision: 2 })] } };
};

const Fixture = ({ scenario }: { scenario: Scenario }) => {
  const renderer = useRef<FormRendererHandle>(null);
  const [data, setData] = useState(scenario.data || {});
  const attachments = useWorkflowFormAttachments(scenario.attachments ? { definitionId: 'attachment-fixture' } : undefined);
  useLayoutEffect(() => {
    window.formBrowserChecks.data = () => renderer.current?.getData() || {};
    window.formBrowserChecks.validate = () => renderer.current?.validate() || false;
    window.formBrowserChecks.ready++;
  });
  return <main className="min-h-screen bg-[var(--cf-bg)] p-4 text-[var(--cf-text-primary)]">
    {scenario.versions ? <MemoryRouter><FormDesign /></MemoryRouter> : scenario.matrix ? <FieldPermissionDialog definitionId="permission-fixture" onClose={() => window.formBrowserChecks.mount('amount')} />
      : scenario.builder ? <FormBuilder initialForm={scenario.form} onSave={(saved) => { window.formBrowserChecks.saved = saved; }} />
        : <FormRenderer ref={renderer} hideActions={!scenario.attachments} submitDisabled={attachments.uploading} formDef={scenario.form} data={data} onDataChange={setData} fieldPermissions={scenario.permissions} fieldErrors={scenario.errors} layoutMode={scenario.layoutMode} renderReferenceField={reference} renderUploadField={scenario.attachments ? attachments.renderUploadField : upload} />}
  </main>;
};

const root = createRoot(document.getElementById('root')!);
let revision = 0;
window.formBrowserChecks = {
  mount: (name) => {
    window.formBrowserChecks.renders = {};
    window.formBrowserChecks.saved = undefined;
    const scenario = scenarios(name);
    const started = performance.now();
    flushSync(() => root.render(<QueryClientProvider client={queryClient}><AuthProvider><Fixture key={++revision} scenario={scenario} /></AuthProvider></QueryClientProvider>));
    window.formBrowserChecks.renderMs = performance.now() - started;
  },
  data: () => ({}), validate: () => false, renders: {}, renderMs: 0, ready: 0,
};
window.formBrowserChecks.mount('all');
