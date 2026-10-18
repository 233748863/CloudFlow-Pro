import type { AriaAttributes, ReactNode } from 'react';
import type { FormField } from '../../types';

export interface FormErrorFocusTarget {
  path: string;
  request: number;
}

export interface FormReferenceFieldRenderProps {
  controlProps?: AriaAttributes & { id?: string };
  field: FormField;
  fieldPath?: string;
  value: unknown;
  data: Record<string, any>;
  disabled: boolean;
  className?: string;
  onChange: (selection: { id: string; label: string } | null) => void;
  onMultiChange?: (selections: Array<{ id: string; label: string }>) => void;
}

export interface FormUploadFieldRenderProps {
  controlProps?: AriaAttributes & { id?: string };
  field: FormField;
  fieldPath: string;
  value: unknown;
  disabled: boolean;
  readonly: boolean;
  onChange: (fileIds: string[]) => void;
}

export interface FormRenderServices {
  layoutMode?: 'auto' | 'desktop' | 'mobile';
  renderReferenceField?: (props: FormReferenceFieldRenderProps) => ReactNode;
  renderUploadField?: (props: FormUploadFieldRenderProps) => ReactNode;
  idValuesAsStrings?: boolean;
}
