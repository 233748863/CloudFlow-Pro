import type { FormField } from '../../types';

export interface FieldPropertyEditorProps {
  field: FormField;
  fieldPath: string;
  fields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}
