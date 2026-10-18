import React, { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Send } from 'lucide-react';
import type { FormDefinition, FormField } from '../types';
import type { FieldPermission } from '@/types/workflowSemantic';
import { BaseDialog, Button } from '@/components/common';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { createFormDefaults, getFormValueFields } from '@/utils/formTree';
import { projectFormInput, validateFormInput } from '@/utils/formValueRuntime';
import { FormFieldTree } from './form-renderer/FormFieldTree';
import type { FormRenderServices } from './form-renderer/types';

export type { FormReferenceFieldRenderProps, FormUploadFieldRenderProps } from './form-renderer/types';

export interface FormRendererProps extends FormRenderServices {
  formDef: FormDefinition | undefined;
  onSubmit?: (data: Record<string, any>) => void;
  onCancel?: () => void;
  data?: Record<string, any>;
  onChange?: (id: string, value: any) => void;
  onDataChange?: (data: Record<string, any>) => void;
  fieldPermissions?: FieldPermission[];
  fieldErrors?: Record<string, string>;
  nodeKey?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  readonly?: boolean;
  hideActions?: boolean;
}

export interface FormRendererHandle {
  validate: () => boolean;
  submit: () => void;
  getData: () => Record<string, any>;
}

const emptyFields: FormField[] = [];

export const FormRenderer = React.forwardRef<FormRendererHandle, FormRendererProps>(({
  formDef, onSubmit, onCancel, data, onChange, onDataChange, renderReferenceField, renderUploadField, fieldPermissions,
  fieldErrors, nodeKey, disabled = false, submitDisabled = false, idValuesAsStrings = false, readonly = false, hideActions = false, layoutMode = 'auto',
}, ref) => {
  const fields = formDef?.fields || emptyFields;
  const [internalData, setInternalData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  useEffect(() => {
    if (fieldErrors && Object.values(fieldErrors).some(Boolean)) setErrorFocusRequest((request) => request + 1);
  }, [fieldErrors]);
  const defaults = useMemo(() => createFormDefaults(fields), [fields]);
  useEffect(() => { setInternalData({}); setErrors({}); }, [formDef?.id, formDef?.version]);
  const runtimeData = useMemo(() => {
    const supplied = data === undefined ? internalData : data;
    const values = { ...defaults, ...supplied };
    if (!fieldPermissions) {
      for (const field of getFormValueFields(fields)) {
        if (Object.hasOwn(supplied, field.id)) continue;
        const alias = Object.keys(supplied).find((key) => key.toLowerCase() === field.id.toLowerCase() || key.toLowerCase() === field.label.toLowerCase());
        if (alias !== undefined) values[field.id] = supplied[alias];
      }
    }
    return values;
  }, [data, internalData, defaults, fields, fieldPermissions]);
  const handleChange = (field: FormField, value: unknown, extra: Record<string, unknown> = {}) => {
    if (disabled || readonly || field.readonly) return;
    const next = { ...runtimeData, [field.id]: value, ...extra };
    if (data !== undefined) {
      if (onDataChange) onDataChange(next);
      else { onChange?.(field.id, value); Object.entries(extra).forEach(([fieldId, update]) => onChange?.(fieldId, update)); }
    } else setInternalData(next);
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([path]) => path !== field.id && !path.startsWith(`${field.id}[`) && !Object.hasOwn(extra, path))));
  };
  const getData = () => fieldPermissions ? projectFormInput(fields, runtimeData, { permissions: fieldPermissions, nodeKey }) : runtimeData;
  const validate = () => {
    if (!formDef) return false;
    const nextErrors = validateFormInput(fields, runtimeData, { permissions: fieldPermissions, nodeKey, readonly });
    setErrors(nextErrors);
    setErrorFocusRequest((request) => request + 1);
    const first = Object.keys(nextErrors)[0];
    return !first;
  };
  const submit = () => { if (!disabled && !submitDisabled && !readonly && validate()) onSubmit?.(getData()); };
  useImperativeHandle(ref, () => ({ validate, submit, getData }));
  const content = <>{formDef?.versionUnknownFlag ? <p role="status" className="mb-3 rounded-md border border-[var(--cf-chart-warning)] p-3 text-sm text-cf-subtle">表单版本未知 · 当前按最新版展示，请核对历史字段信息</p> : null}{fields.length ? <FormFieldTree fields={fields} data={runtimeData} permissions={fieldPermissions} nodeKey={nodeKey} errors={{ ...errors, ...fieldErrors }} disabled={disabled} readonly={readonly}
    errorFocusRequest={errorFocusRequest} renderReferenceField={renderReferenceField} renderUploadField={renderUploadField} idValuesAsStrings={idValuesAsStrings} layoutMode={layoutMode} onChange={handleChange} />
    : <WorkspaceInlineState type="info" icon={<AlertTriangle size={18} />} title="暂无表单字段" description="当前表单未配置字段。" className="py-8" />}</>;
  if (hideActions) return content;
  return <BaseDialog open title={`${readonly ? '查看' : '填写'}：${formDef?.name || '表单'}`} headerAside={<FileText size={18} className="text-cyan-700 dark:text-cyan-300" />} onClose={() => onCancel?.()} width="wide" maxWidthClassName="w-full max-w-5xl"
    footer={<><Button type="button" variant="outline" onClick={onCancel}>{readonly ? '关闭' : '取消'}</Button>{!readonly ? <Button type="button" onClick={submit} disabled={disabled || submitDisabled || !formDef}><Send size={16} className="mr-2" />提交申请</Button> : null}</>}>{content}</BaseDialog>;
});

FormRenderer.displayName = 'FormRenderer';
