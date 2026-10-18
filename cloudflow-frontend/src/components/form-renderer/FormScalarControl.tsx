import React, { Suspense } from 'react';
import { getFieldTypeDefinition } from '../form-builder/fieldRegistry';
import type { FormScalarControlProps } from './BuiltinFieldControl';

export type { FormScalarControlProps } from './BuiltinFieldControl';

export const FormScalarControl: React.FC<FormScalarControlProps> = (props) => {
  const Control = getFieldTypeDefinition(props.field.type)?.control;
  if (!Control) return <p role="alert" className="text-sm text-red-600">不支持的字段类型</p>;
  return <Suspense fallback={<div role="status" className="min-h-9 animate-pulse rounded-md bg-[var(--cf-surface-muted)]" aria-label="正在加载字段" />}><Control {...props} /></Suspense>;
};
